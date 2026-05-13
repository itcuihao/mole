package session

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"mole/internal/codex"
	"mole/internal/config"
	"mole/internal/docker"
	"mole/internal/inventory"
	"mole/internal/profile"
	"mole/internal/terminal"

	"github.com/google/uuid"
)

var validName = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// Manager orchestrates session operations across store, runtime backends, and profiles.
type Manager struct {
	store            *Store
	profileMgr       *profile.Manager
	invMgr           *inventory.Manager
	codexMgr         *codex.Manager
	backends         map[string]SessionBackend
	defaultBackendID string
	plugins          *pluginRegistry
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

	m := &Manager{
		store:            NewStore(storePath),
		profileMgr:       profileMgr,
		invMgr:           invMgr,
		backends:         registry,
		defaultBackendID: defaultBackend.ID(),
		plugins:          newPluginRegistry(),
	}
	m.registerBuiltinPlugins(invMgr)
	return m
}

// SetCodexManager wires optional Codex home preparation for Codex sessions.
func (m *Manager) SetCodexManager(codexMgr *codex.Manager) {
	m.codexMgr = codexMgr
	m.plugins.register(NewCodexPlugin(codexMgr))
}

// SetDockerManager wires the Docker config manager and registers the docker plugin.
func (m *Manager) SetDockerManager(dockerMgr *docker.Manager) {
	m.plugins.register(NewDockerPlugin(dockerMgr))
}

// Create creates a new runtime session with the environment from a profile.
func (m *Manager) Create(profileID, sessionName, command, runMode, hostID, codexConfigID, den string) error {
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

	resolvedCommand, normalizedRunMode, normalizedHostID, normalizedCodexConfigID, err := m.resolveLaunchConfig(command, runMode, hostID, codexConfigID)
	if err != nil {
		return err
	}

	// Resolve full environment
	env, err := m.profileMgr.GetFullEnv(profileID)
	if err != nil {
		return fmt.Errorf("failed to resolve profile env: %w", err)
	}

	env, resolvedCommand, err = m.prepareLaunchEnv(normalizedRunMode, normalizedCodexConfigID, env, resolvedCommand)
	if err != nil {
		return err
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
		CodexConfigID:   normalizedCodexConfigID,
		Den:             strings.TrimSpace(den),
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
func (m *Manager) Update(sessionID, profileID, command, runMode, hostID, codexConfigID, den string) error {
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

	oldCommand := sess.Command
	oldSession := sess

	resolvedCommand, normalizedRunMode, normalizedHostID, normalizedCodexConfigID, err := m.resolveLaunchConfig(command, runMode, hostID, codexConfigID)
	if err != nil {
		return err
	}

	// Resolve the replacement environment before touching the live session.
	newEnv, err := m.profileMgr.GetFullEnv(profileID)
	if err != nil {
		return fmt.Errorf("failed to resolve profile env: %w", err)
	}

	newEnv, resolvedCommand, err = m.prepareLaunchEnv(normalizedRunMode, normalizedCodexConfigID, newEnv, resolvedCommand)
	if err != nil {
		return err
	}

	if err := backend.EnsureAvailable(); err != nil {
		return err
	}

	isAlive := backend.IsAlive(sess.RuntimeName())
	var rollbackEnv map[string]string
	canRollback := false

	if isAlive {
		if currentEnv, currentErr := m.environmentForSession(oldSession); currentErr == nil {
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
	sess.CodexConfigID = normalizedCodexConfigID
	sess.Den = strings.TrimSpace(den)

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

	// Resolve environment from profile and launch metadata.
	env, err := m.environmentForSession(sess)
	if err != nil {
		return fmt.Errorf("failed to resolve profile env: %w", err)
	}

	command, err := m.commandForSession(sess)
	if err != nil {
		return err
	}

	runtimeName := sess.RuntimeName()
	if backend.IsAlive(runtimeName) {
		if err := backend.Kill(runtimeName); err != nil {
			return fmt.Errorf("failed to kill session before restart: %w", err)
		}
	}

	return backend.Create(runtimeName, env, command)
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

	env, err := m.environmentForSession(sess)
	if err != nil {
		return Session{}, terminal.LaunchSpec{}, fmt.Errorf("failed to resolve attach env for [%s]: %w", sess.RuntimeName(), err)
	}

	runtimeName := sess.RuntimeName()
	if backend.IsAlive(runtimeName) {
		if err := backend.SyncEnv(runtimeName, env); err != nil {
			fmt.Printf("⚠️ failed to refresh backend env for [%s]: %v\n", runtimeName, err)
		}
	} else {
		// Session is dead (UI may be stale) — restart it before attaching so the
		// terminal doesn't open only to fail with "can't find session".
		command, cmdErr := m.commandForSession(sess)
		if cmdErr != nil {
			return Session{}, terminal.LaunchSpec{}, fmt.Errorf("failed to resolve command for [%s]: %w", runtimeName, cmdErr)
		}
		if createErr := backend.Create(runtimeName, env, command); createErr != nil {
			return Session{}, terminal.LaunchSpec{}, fmt.Errorf("session is not running and could not be restarted: %w", createErr)
		}
	}

	launchSpec, err := backend.BuildAttachSpec(runtimeName, env, sess.Den)
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

func (m *Manager) resolveLaunchConfig(command, runMode, hostID, codexConfigID string) (string, string, string, string, error) {
	normalizedRunMode := strings.TrimSpace(runMode)
	trimmedCommand := strings.TrimSpace(command)
	trimmedHostID := strings.TrimSpace(hostID)
	trimmedCodexConfigID := strings.TrimSpace(codexConfigID)

	if normalizedRunMode == "" {
		normalizedRunMode = m.inferRunMode(trimmedCommand, trimmedHostID, trimmedCodexConfigID)
	}

	plugin, ok := m.plugins.get(normalizedRunMode)
	if !ok {
		return "", "", "", "", fmt.Errorf("unsupported run mode %q", normalizedRunMode)
	}

	cfg, err := plugin.Resolve(trimmedCommand, trimmedHostID, trimmedCodexConfigID)
	if err != nil {
		return "", "", "", "", err
	}

	return cfg.Command, normalizedRunMode, cfg.HostID, cfg.CodexConfigID, nil
}

func (m *Manager) commandForSession(sess Session) (string, error) {
	if sess.RunMode == "" {
		return strings.TrimSpace(sess.Command), nil
	}
	plugin, ok := m.plugins.get(sess.RunMode)
	if !ok {
		return strings.TrimSpace(sess.Command), nil
	}
	return plugin.Command(sess.Command, sess.HostID)
}

func (m *Manager) environmentForSession(sess Session) (map[string]string, error) {
	env, err := m.profileMgr.GetFullEnv(sess.ProfileID)
	if err != nil {
		return nil, err
	}

	command, err := m.commandForSession(sess)
	if err != nil {
		return nil, err
	}

	env, _, err = m.prepareLaunchEnv(sess.RunMode, sess.CodexConfigID, env, command)
	if err != nil {
		return nil, err
	}
	return env, nil
}

func (m *Manager) prepareLaunchEnv(runMode, codexConfigID string, env map[string]string, command string) (map[string]string, string, error) {
	plugin, ok := m.plugins.get(runMode)
	if !ok {
		return env, command, nil
	}
	return plugin.PrepareEnv(codexConfigID, env, command)
}

// ExportBurrowSessions returns the portable static session configuration set.
func (m *Manager) ExportBurrowSessions() ([]WorkspaceSession, error) {
	sessions, err := m.store.List()
	if err != nil {
		return nil, err
	}

	result := make([]WorkspaceSession, 0, len(sessions))
	for _, sess := range sessions {
		result = append(result, sess.WorkspaceConfig())
	}

	return result, nil
}

// PrepareBurrowImport validates and normalizes imported session configs without persisting them.
func (m *Manager) PrepareBurrowImport(configs []WorkspaceSession, profileIDs map[string]struct{}, hostIDs map[string]struct{}) ([]Session, error) {
	defaultBackend, err := m.defaultBackend()
	if err != nil {
		return nil, err
	}
	defaultBackendID := defaultBackend.ID()

	if configs == nil {
		return []Session{}, nil
	}

	prepared := make([]Session, 0, len(configs))
	seenIDs := make(map[string]struct{}, len(configs))
	seenNames := make(map[string]struct{}, len(configs))
	seenRuntimeNames := make(map[string]struct{}, len(configs))

	for _, cfg := range configs {
		name := strings.TrimSpace(cfg.Name)
		if !validName.MatchString(name) {
			return nil, fmt.Errorf("session %q has an invalid name", cfg.Name)
		}
		if _, exists := seenNames[name]; exists {
			return nil, fmt.Errorf("duplicate session name %q", name)
		}
		seenNames[name] = struct{}{}

		runtimeName := RuntimeNameForSessionName(name)
		if _, exists := seenRuntimeNames[runtimeName]; exists {
			return nil, fmt.Errorf("duplicate runtime session name %q", runtimeName)
		}
		seenRuntimeNames[runtimeName] = struct{}{}

		id := strings.TrimSpace(cfg.ID)
		if id == "" {
			id = uuid.New().String()
		}
		if _, exists := seenIDs[id]; exists {
			return nil, fmt.Errorf("duplicate session id %q", id)
		}
		seenIDs[id] = struct{}{}

		profileID := strings.TrimSpace(cfg.ProfileID)
		if profileID == "" {
			return nil, fmt.Errorf("session %q is missing a profile", name)
		}
		if _, exists := profileIDs[profileID]; !exists {
			return nil, fmt.Errorf("session %q references unknown profile %q", name, profileID)
		}

		command := strings.TrimSpace(cfg.Command)
		runMode := strings.TrimSpace(cfg.RunMode)
		hostID := strings.TrimSpace(cfg.HostID)
		codexConfigID := strings.TrimSpace(cfg.CodexConfigID)

		if runMode == "" {
			runMode = m.inferRunMode(command, hostID, codexConfigID)
		}

		plugin, ok := m.plugins.get(runMode)
		if !ok {
			return nil, fmt.Errorf("session %q uses unsupported run mode %q", name, runMode)
		}

		launchCfg, err := plugin.Validate(command, hostID, codexConfigID)
		if err != nil {
			return nil, fmt.Errorf("session %q: %w", name, err)
		}
		command = launchCfg.Command
		hostID = launchCfg.HostID
		codexConfigID = launchCfg.CodexConfigID

		if runMode == RunModeHost && hostID != "" {
			if _, exists := hostIDs[hostID]; !exists {
				return nil, fmt.Errorf("session %q references unknown host %q", name, hostID)
			}
		}

		backendID := strings.TrimSpace(cfg.BackendID)
		if backendID == "" || m.backends[backendID] == nil {
			backendID = defaultBackendID
		}

		createdAt := strings.TrimSpace(cfg.CreatedAt)
		if createdAt == "" {
			createdAt = time.Now().Format(time.RFC3339Nano)
		}

		prepared = append(prepared, Session{
			ID:              id,
			Name:            name,
			ProfileID:       profileID,
			BackendID:       backendID,
			TmuxSessionName: runtimeName,
			Command:         command,
			RunMode:         runMode,
			HostID:          hostID,
			CodexConfigID:   codexConfigID,
			Den:             strings.TrimSpace(cfg.Den),
			CreatedAt:       createdAt,
		})
	}

	return prepared, nil
}

// StopTrackedSessions terminates all currently tracked runtime sessions before destructive burrow operations.
func (m *Manager) StopTrackedSessions() error {
	current, err := m.store.List()
	if err != nil {
		return err
	}

	for _, sess := range current {
		sess.NormalizeRuntimeMetadata()
		runtimeName := sess.RuntimeName()
		if runtimeName == "" {
			continue
		}

		backend, backendErr := m.backendForSession(sess)
		if backendErr != nil {
			continue
		}
		if !backend.IsAlive(runtimeName) {
			continue
		}
		if err := backend.Kill(runtimeName); err != nil && backend.IsAlive(runtimeName) {
			return fmt.Errorf("failed to stop running session %q before import: %w", sess.Name, err)
		}
	}

	return nil
}

// ReplaceAllImported overwrites the stored session set with prepared imported sessions.
func (m *Manager) ReplaceAllImported(sessions []Session) error {
	return m.store.ReplaceAll(sessions)
}

// RegisterPlugin registers a launch plugin for a run mode.
func (m *Manager) RegisterPlugin(p LaunchPlugin) {
	m.plugins.register(p)
}

// ListLaunchPlugins returns metadata for all registered launch plugins.
func (m *Manager) ListLaunchPlugins() []PluginInfo {
	return m.plugins.listInfo()
}

func (m *Manager) registerBuiltinPlugins(invMgr *inventory.Manager) {
	m.plugins.register(NewShellPlugin())
	m.plugins.register(NewCustomPlugin())
	m.plugins.register(NewHostPlugin(invMgr))
	m.plugins.register(NewCodexPlugin(m.codexMgr))
}

func (m *Manager) inferRunMode(command, hostID, codexConfigID string) string {
	switch {
	case codexConfigID != "":
		return RunModeCodex
	case hostID != "":
		return RunModeHost
	case command != "":
		return RunModeCustom
	default:
		return RunModeShell
	}
}
