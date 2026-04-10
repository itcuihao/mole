package session

import (
	"fmt"
	"regexp"
	"strings"

	"mole/internal/config"
	"mole/internal/inventory"
	"mole/internal/profile"
	"mole/internal/terminal"
)

var validName = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// Manager orchestrates session operations across store, runtime backends, and profiles.
type Manager struct {
	store            *Store
	profileMgr       *profile.Manager
	invMgr           *inventory.Manager
	backends         map[string]SessionBackend
	defaultBackendID string
}

// NewManager creates a new session Manager.
func NewManager(storePath string, profileMgr *profile.Manager, invMgr *inventory.Manager) *Manager {
	return NewPlatformManager(storePath, profileMgr, invMgr)
}

// NewManagerWithBackend creates a new session Manager with an explicit runtime backend.
func NewManagerWithBackend(storePath string, profileMgr *profile.Manager, invMgr *inventory.Manager, backend SessionBackend) *Manager {
	return NewManagerWithBackends(storePath, profileMgr, invMgr, backend)
}

// NewManagerWithBackends creates a new session Manager with one or more runtime backends.
func NewManagerWithBackends(storePath string, profileMgr *profile.Manager, invMgr *inventory.Manager, defaultBackend SessionBackend, extraBackends ...SessionBackend) *Manager {
	if defaultBackend == nil {
		defaultBackend = NewTmuxBackend()
	}

	registry := make(map[string]SessionBackend)
	for _, backend := range append([]SessionBackend{defaultBackend}, extraBackends...) {
		if backend == nil {
			continue
		}
		registry[backend.ID()] = backend
	}

	return &Manager{
		store:            NewStore(storePath),
		profileMgr:       profileMgr,
		invMgr:           invMgr,
		backends:         registry,
		defaultBackendID: defaultBackend.ID(),
	}
}

// Create creates a new runtime session with the environment from a profile.
func (m *Manager) Create(profileID, sessionName, command, runMode, hostID string) error {
	if !validName.MatchString(sessionName) {
		return fmt.Errorf("session name must contain only letters, digits, underscores, and dashes")
	}

	backend, err := m.defaultBackend()
	if err != nil {
		return err
	}

	if err := backend.EnsureAvailable(); err != nil {
		return err
	}

	tmuxName := "mole-" + sessionName
	if backend.IsAlive(tmuxName) {
		return fmt.Errorf("%s session %q already exists", backend.ID(), tmuxName)
	}

	resolvedCommand, normalizedRunMode, normalizedHostID, err := m.resolveLaunchConfig(command, runMode, hostID)
	if err != nil {
		return err
	}

	// Resolve full environment
	env, err := m.profileMgr.GetFullEnv(profileID)
	if err != nil {
		return fmt.Errorf("failed to resolve profile env: %w", err)
	}

	if err := backend.Create(tmuxName, env, resolvedCommand); err != nil {
		return err
	}

	// Save session metadata
	sess := Session{
		Name:            sessionName,
		ProfileID:       profileID,
		BackendID:       backend.ID(),
		TmuxSessionName: tmuxName,
		Command:         resolvedCommand,
		RunMode:         normalizedRunMode,
		HostID:          normalizedHostID,
	}
	return m.store.Save(sess)
}

// ListWithStatus returns all sessions with live backend status.
// Sessions are persisted even if the backend runtime is currently unavailable.
func (m *Manager) ListWithStatus() ([]SessionStatus, error) {
	sessions, err := m.store.List()
	if err != nil {
		return nil, err
	}

	runtimeMaps := make(map[string]map[string]RuntimeSessionInfo)
	for _, sess := range sessions {
		backend, backendErr := m.backendForSession(sess)
		if backendErr != nil {
			continue
		}
		backendID := sess.EffectiveBackendID()
		if _, loaded := runtimeMaps[backendID]; loaded {
			continue
		}

		runtimeSessions, listErr := backend.List()
		if listErr != nil {
			runtimeMaps[backendID] = map[string]RuntimeSessionInfo{}
			continue
		}

		runtimeMap := make(map[string]RuntimeSessionInfo, len(runtimeSessions))
		for _, runtimeSession := range runtimeSessions {
			runtimeMap[runtimeSession.Name] = runtimeSession
		}
		runtimeMaps[backendID] = runtimeMap
	}

	// Load profiles for name/color lookup
	profiles, _ := m.profileMgr.List()
	profileMap := make(map[string]profile.Profile)
	for _, p := range profiles {
		profileMap[p.ID] = p
	}

	result := make([]SessionStatus, 0)

	for _, sess := range sessions {
		sess.NormalizeRuntimeMetadata()
		runtimeMap := runtimeMaps[sess.BackendID]
		ts, alive := runtimeMap[sess.RuntimeName()]

		status := SessionStatus{
			Session:  sess,
			Alive:    alive,
			Attached: alive && ts.Attached > 0,
			Windows:  0,
		}

		if alive {
			status.Windows = ts.Windows
		}

		if p, ok := profileMap[sess.ProfileID]; ok {
			status.ProfileName = p.Name
			status.ProfileColor = p.Color
		}

		result = append(result, status)
	}

	return result, nil
}

// Update updates an existing session's profile and/or command.
// If the session is alive, it will be recreated with new settings.
func (m *Manager) Update(sessionID, profileID, command, runMode, hostID string) error {
	// Get current session
	sess, err := m.store.Get(sessionID)
	if err != nil {
		return err
	}
	sess.NormalizeRuntimeMetadata()

	backend, err := m.backendForSession(sess)
	if err != nil {
		return err
	}

	oldProfileID := sess.ProfileID
	oldCommand := sess.Command

	resolvedCommand, normalizedRunMode, normalizedHostID, err := m.resolveLaunchConfig(command, runMode, hostID)
	if err != nil {
		return err
	}

	// Resolve the replacement environment before touching the live session.
	newEnv, err := m.profileMgr.GetFullEnv(profileID)
	if err != nil {
		return fmt.Errorf("failed to resolve profile env: %w", err)
	}

	if err := backend.EnsureAvailable(); err != nil {
		return err
	}

	isAlive := backend.IsAlive(sess.RuntimeName())
	var rollbackEnv map[string]string
	canRollback := false

	if isAlive {
		if currentEnv, currentErr := m.profileMgr.GetFullEnv(oldProfileID); currentErr == nil {
			rollbackEnv = currentEnv
			canRollback = true
		}
	}

	if isAlive {
		if err := backend.Kill(sess.RuntimeName()); err != nil {
			return fmt.Errorf("failed to kill existing session: %w", err)
		}
	}

	// Update session metadata
	sess.ProfileID = profileID
	sess.BackendID = backend.ID()
	sess.Command = resolvedCommand
	sess.RunMode = normalizedRunMode
	sess.HostID = normalizedHostID

	if err := backend.Create(sess.RuntimeName(), newEnv, resolvedCommand); err != nil {
		if isAlive && canRollback {
			if rollbackErr := backend.Create(sess.RuntimeName(), rollbackEnv, oldCommand); rollbackErr != nil {
				return fmt.Errorf("failed to recreate session with new settings: %w (rollback also failed: %v)", err, rollbackErr)
			}
			return fmt.Errorf("failed to recreate session with new settings: %w (restored previous session)", err)
		}
		return err
	}

	// Save updated metadata
	if err := m.store.Update(sess); err != nil {
		_ = backend.Kill(sess.RuntimeName())
		if isAlive && canRollback {
			if rollbackErr := backend.Create(sess.RuntimeName(), rollbackEnv, oldCommand); rollbackErr != nil {
				return fmt.Errorf("failed to persist session update: %w (rollback also failed: %v)", err, rollbackErr)
			}
			return fmt.Errorf("failed to persist session update: %w (restored previous session)", err)
		}
		return err
	}

	return nil
}

// Kill terminates a runtime session when present and removes it from the store.
func (m *Manager) Kill(sessionID string) error {
	sess, err := m.store.Get(sessionID)
	if err != nil {
		return fmt.Errorf("session not found: %w", err)
	}
	sess.NormalizeRuntimeMetadata()

	backend, err := m.backendForSession(sess)
	if err != nil {
		return err
	}

	runtimeName := sess.RuntimeName()
	if err := backend.Kill(runtimeName); err != nil {
		if !backend.IsAlive(runtimeName) {
			return m.store.Delete(sessionID)
		}
		return err
	}
	return m.store.Delete(sessionID)
}

// Restart recreates a dead runtime session using its stored configuration.
func (m *Manager) Restart(sessionID string) error {
	// Get session metadata
	sess, err := m.store.Get(sessionID)
	if err != nil {
		return fmt.Errorf("session not found: %w", err)
	}
	sess.NormalizeRuntimeMetadata()

	backend, err := m.backendForSession(sess)
	if err != nil {
		return err
	}

	if err := backend.EnsureAvailable(); err != nil {
		return err
	}

	if backend.IsAlive(sess.RuntimeName()) {
		return fmt.Errorf("session %q is already running", sess.Name)
	}

	// Resolve environment from profile
	env, err := m.profileMgr.GetFullEnv(sess.ProfileID)
	if err != nil {
		return fmt.Errorf("failed to resolve profile env: %w", err)
	}

	command, err := m.commandForSession(sess)
	if err != nil {
		return err
	}

	return backend.Create(sess.RuntimeName(), env, command)
}

// Attach opens the user's preferred terminal and attaches to a runtime session.
func (m *Manager) Attach(sessionID string) error {
	// Load user's preferred terminal
	settings, err := config.LoadSettings()
	if err != nil {
		settings = &config.Settings{}
	}

	// Use configured terminal or auto-detect best one
	terminalID := settings.DefaultTerminal
	if terminalID == "" {
		bestTerminal := terminal.GetDefaultTerminal()
		if bestTerminal != nil {
			terminalID = bestTerminal.ID
		} else {
			terminalID = terminal.DefaultTerminalID()
		}
	}

	sess, launchSpec, err := m.resolveAttachLaunchSpec(sessionID)
	if err != nil {
		return err
	}

	err = terminal.Launch(terminalID, launchSpec)
	if err != nil {
		// Log error for debugging
		fmt.Printf("❌ Attach error [terminal=%s, session=%s]: %v\n", terminalID, sess.RuntimeName(), err)
		return err
	}
	if touchErr := m.store.RecordOpen(sess.ID); touchErr != nil {
		fmt.Printf("⚠️ failed to record session usage for [%s]: %v\n", sess.ID, touchErr)
	}
	return nil
}

// AttachWithTerminal opens a specific terminal and attaches to a runtime session.
func (m *Manager) AttachWithTerminal(sessionID, terminalID string) error {
	sess, launchSpec, err := m.resolveAttachLaunchSpec(sessionID)
	if err != nil {
		return err
	}

	err = terminal.Launch(terminalID, launchSpec)
	if err != nil {
		// Log error for debugging
		fmt.Printf("❌ AttachWithTerminal error [terminal=%s, session=%s]: %v\n", terminalID, sess.RuntimeName(), err)
		return err
	}
	if touchErr := m.store.RecordOpen(sess.ID); touchErr != nil {
		fmt.Printf("⚠️ failed to record session usage for [%s]: %v\n", sess.ID, touchErr)
	}
	return nil
}

func (m *Manager) resolveAttachLaunchSpec(sessionID string) (Session, terminal.LaunchSpec, error) {
	if m.store == nil || m.profileMgr == nil {
		return Session{}, terminal.LaunchSpec{}, fmt.Errorf("session manager is not fully initialized")
	}

	sess, err := m.store.Get(sessionID)
	if err != nil {
		return Session{}, terminal.LaunchSpec{}, fmt.Errorf("session not found: %w", err)
	}
	sess.NormalizeRuntimeMetadata()

	backend, backendErr := m.backendForSession(sess)
	if backendErr != nil {
		return Session{}, terminal.LaunchSpec{}, backendErr
	}

	env, err := m.profileMgr.GetFullEnv(sess.ProfileID)
	if err != nil {
		return Session{}, terminal.LaunchSpec{}, fmt.Errorf("failed to resolve attach env for [%s]: %w", sess.RuntimeName(), err)
	}

	runtimeName := sess.RuntimeName()
	if backend.IsAlive(runtimeName) {
		if err := backend.SyncEnv(runtimeName, env); err != nil {
			fmt.Printf("⚠️ failed to refresh backend env for [%s]: %v\n", runtimeName, err)
		}
	}

	launchSpec, err := backend.BuildAttachSpec(runtimeName, env)
	if err != nil {
		return Session{}, terminal.LaunchSpec{}, err
	}

	return sess, launchSpec, nil
}

func (m *Manager) defaultBackend() (SessionBackend, error) {
	if m.backends == nil {
		backend := NewTmuxBackend()
		m.backends = map[string]SessionBackend{backend.ID(): backend}
		m.defaultBackendID = backend.ID()
	}
	if backend, ok := m.backends[m.defaultBackendID]; ok {
		return backend, nil
	}
	return nil, fmt.Errorf("default session backend %q is not registered", m.defaultBackendID)
}

func (m *Manager) backendForSession(sess Session) (SessionBackend, error) {
	backendID := sess.EffectiveBackendID()
	if m.backends != nil {
		if backend, ok := m.backends[backendID]; ok {
			return backend, nil
		}
	}
	return nil, fmt.Errorf("session backend %q is not registered", backendID)
}

func (m *Manager) resolveLaunchConfig(command, runMode, hostID string) (string, string, string, error) {
	normalizedRunMode := strings.TrimSpace(runMode)
	trimmedCommand := strings.TrimSpace(command)
	trimmedHostID := strings.TrimSpace(hostID)

	if normalizedRunMode == "" {
		switch {
		case trimmedHostID != "":
			normalizedRunMode = RunModeHost
		case trimmedCommand != "":
			normalizedRunMode = RunModeCustom
		default:
			normalizedRunMode = RunModeShell
		}
	}

	switch normalizedRunMode {
	case RunModeShell:
		return "", RunModeShell, "", nil
	case RunModeCustom:
		return trimmedCommand, RunModeCustom, "", nil
	case RunModeHost:
		if trimmedHostID == "" {
			return "", "", "", fmt.Errorf("host mode requires a selected host")
		}
		if m.invMgr == nil {
			return "", "", "", fmt.Errorf("host inventory is unavailable")
		}
		hostCommand, err := m.invMgr.BuildSSHCommand(trimmedHostID)
		if err != nil {
			return "", "", "", fmt.Errorf("failed to resolve host command: %w", err)
		}
		return hostCommand, RunModeHost, trimmedHostID, nil
	default:
		return "", "", "", fmt.Errorf("unsupported run mode %q", normalizedRunMode)
	}
}

func (m *Manager) commandForSession(sess Session) (string, error) {
	if sess.RunMode == RunModeHost && strings.TrimSpace(sess.HostID) != "" {
		if m.invMgr == nil {
			return "", fmt.Errorf("host inventory is unavailable")
		}
		command, err := m.invMgr.BuildSSHCommand(strings.TrimSpace(sess.HostID))
		if err != nil {
			return "", fmt.Errorf("failed to resolve host command: %w", err)
		}
		return command, nil
	}

	return strings.TrimSpace(sess.Command), nil
}
