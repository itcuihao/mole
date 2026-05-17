package session

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"mole/internal/codex"
	"mole/internal/config"
	"mole/internal/docker"
	"mole/internal/inventory"
	"mole/internal/pluginconfig"
	"mole/internal/profile"
	"mole/internal/scriptcfg"
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
	pluginConfigMgr  *pluginconfig.Manager
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

// SetPluginConfigManager wires reusable presets for external launch plugins.
func (m *Manager) SetPluginConfigManager(pluginConfigMgr *pluginconfig.Manager) {
	m.pluginConfigMgr = pluginConfigMgr
	m.registerPresetPlugins(pluginConfigMgr)
}

// SetScriptManager wires the script config manager and registers the script plugin.
func (m *Manager) SetScriptManager(scriptMgr *scriptcfg.Manager) {
	m.plugins.register(NewScriptPlugin(scriptMgr))
}

// Create creates a new runtime session with the environment from a profile.
func (m *Manager) Create(profileID, sessionName, command, runMode, hostID, codexConfigID, den, cwd string) error {
	return m.CreateWithRequest(SessionLaunchRequest{
		ProfileID:     profileID,
		Name:          sessionName,
		Cwd:           cwd,
		Command:       command,
		RunMode:       runMode,
		HostID:        hostID,
		CodexConfigID: codexConfigID,
		Den:           den,
	})
}

// CreateWithRequest creates a new runtime session from a V2 launch payload.
func (m *Manager) CreateWithRequest(req SessionLaunchRequest) error {
	profileID := strings.TrimSpace(req.ProfileID)
	sessionName := strings.TrimSpace(req.Name)
	if !validName.MatchString(sessionName) {
		return fmt.Errorf("session name must contain only letters, digits, underscores, and dashes")
	}

	backend, err := m.resolveBackend(req.BackendID)
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

	launchCfg, normalizedRunMode, err := m.resolveLaunchConfig(LaunchRequest{
		Command:        req.Command,
		RunMode:        req.RunMode,
		HostID:         req.HostID,
		ScriptID:       req.ScriptID,
		CodexConfigID:  req.CodexConfigID,
		PluginConfigID: req.PluginConfigID,
		PluginData:     req.PluginData,
	})
	if err != nil {
		return err
	}

	// Resolve full environment
	env, err := m.profileMgr.GetFullEnv(profileID)
	if err != nil {
		return fmt.Errorf("failed to resolve profile env: %w", err)
	}
	if cwd := strings.TrimSpace(req.Cwd); cwd != "" {
		env["MOLE_WORKSPACE"] = cwd
	}

	// Record profile timestamp for change detection on attach
	prof, profErr := m.profileMgr.Get(profileID)
	profileUpdatedAt := ""
	if profErr == nil {
		profileUpdatedAt = prof.UpdatedAt
	}

	sess := Session{
		Name:             sessionName,
		ProfileID:        profileID,
		ProfileUpdatedAt: profileUpdatedAt,
		BackendID:        backend.ID(),
		TmuxSessionName:  tmuxName,
		Cwd:              strings.TrimSpace(req.Cwd),
		Command:          launchCfg.Command,
		RunMode:          normalizedRunMode,
		HostID:           launchCfg.HostID,
		ScriptID:         launchCfg.ScriptID,
		CodexConfigID:    launchCfg.CodexConfigID,
		PluginConfigID:   launchCfg.PluginConfigID,
		PluginData:       launchCfg.PluginData,
		Den:              strings.TrimSpace(req.Den),
	}

	env, sess.Command, err = m.prepareLaunchEnv(sess, env, sess.Command)
	if err != nil {
		return err
	}

	if err := backend.Create(tmuxName, env, sess.Command, sess.Cwd, false); err != nil {
		return err
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

func (m *Manager) GetDenOrder(den string) ([]string, error) {
	return m.store.GetDenOrder(strings.TrimSpace(den))
}

func (m *Manager) SaveDenOrder(den string, sessionIDs []string) error {
	return m.store.SaveDenOrder(strings.TrimSpace(den), sessionIDs)
}

func (m *Manager) OpenDen(den string) (OpenDenResult, error) {
	group := strings.TrimSpace(den)
	if group == "" {
		return OpenDenResult{}, fmt.Errorf("den is required")
	}

	statuses, err := m.ListWithStatus()
	if err != nil {
		return OpenDenResult{}, err
	}

	denSessions := make([]SessionStatus, 0)
	for _, status := range statuses {
		if strings.TrimSpace(status.Den) == group {
			denSessions = append(denSessions, status)
		}
	}
	if len(denSessions) == 0 {
		return OpenDenResult{Opened: []string{}, Skipped: []string{}, Failed: []OpenDenFailure{}}, nil
	}

	orderedSessions, err := m.orderDenSessions(group, denSessions)
	if err != nil {
		return OpenDenResult{}, err
	}

	terminalID, err := m.defaultTerminalID()
	if err != nil {
		return OpenDenResult{}, err
	}

	result := OpenDenResult{
		Opened:  []string{},
		Skipped: []string{},
		Failed:  []OpenDenFailure{},
	}

	for _, status := range orderedSessions {
		if status.Attached {
			result.Skipped = append(result.Skipped, status.ID)
			continue
		}
		if _, attachErr := m.AttachWithTerminal(status.ID, terminalID); attachErr != nil {
			result.Failed = append(result.Failed, OpenDenFailure{
				SessionID: status.ID,
				Name:      status.Name,
				Error:     attachErr.Error(),
			})
			continue
		}
		result.Opened = append(result.Opened, status.ID)
	}

	return result, nil
}

// Update updates an existing session's profile and/or command.
// If the session is alive, it will be recreated with new settings.
func (m *Manager) Update(sessionID, profileID, command, runMode, hostID, codexConfigID, den, cwd string) error {
	return m.UpdateWithRequest(SessionUpdateRequest{
		SessionID:     sessionID,
		ProfileID:     profileID,
		Cwd:           cwd,
		Command:       command,
		RunMode:       runMode,
		HostID:        hostID,
		CodexConfigID: codexConfigID,
		Den:           den,
	})
}

// UpdateWithRequest updates a session from a V2 launch payload.
func (m *Manager) UpdateWithRequest(req SessionUpdateRequest) error {
	// Get current session
	sess, err := m.store.Get(req.SessionID)
	if err != nil {
		return err
	}
	sess.NormalizeRuntimeMetadata()

	currentBackend, err := m.backendForSession(sess)
	if err != nil {
		return err
	}

	targetBackendID := strings.TrimSpace(req.BackendID)
	if targetBackendID == "" {
		targetBackendID = sess.EffectiveBackendID()
	}
	targetBackend, err := m.resolveBackend(targetBackendID)
	if err != nil {
		return err
	}

	oldCommand := sess.Command
	oldSession := sess

	launchCfg, normalizedRunMode, err := m.resolveLaunchConfig(LaunchRequest{
		Command:        req.Command,
		RunMode:        req.RunMode,
		HostID:         req.HostID,
		ScriptID:       req.ScriptID,
		CodexConfigID:  req.CodexConfigID,
		PluginConfigID: req.PluginConfigID,
		PluginData:     req.PluginData,
	})
	if err != nil {
		return err
	}

	// Resolve the replacement environment before touching the live session.
	profileID := strings.TrimSpace(req.ProfileID)
	newEnv, err := m.profileMgr.GetFullEnv(profileID)
	if err != nil {
		return fmt.Errorf("failed to resolve profile env: %w", err)
	}

	nextSession := sess
	nextSession.ProfileID = profileID

	// Refresh profile timestamp
	if prof, profErr := m.profileMgr.Get(profileID); profErr == nil {
		nextSession.ProfileUpdatedAt = prof.UpdatedAt
	}
	nextSession.BackendID = targetBackend.ID()
	nextSession.Command = launchCfg.Command
	nextSession.RunMode = normalizedRunMode
	nextSession.HostID = launchCfg.HostID
	nextSession.ScriptID = launchCfg.ScriptID
	nextSession.CodexConfigID = launchCfg.CodexConfigID
	nextSession.PluginConfigID = launchCfg.PluginConfigID
	nextSession.PluginData = launchCfg.PluginData
	nextSession.Den = strings.TrimSpace(req.Den)
	nextSession.Cwd = strings.TrimSpace(req.Cwd)

	newEnv, nextSession.Command, err = m.prepareLaunchEnv(nextSession, newEnv, nextSession.Command)
	if err != nil {
		return err
	}

	if err := targetBackend.EnsureAvailable(); err != nil {
		return err
	}

	isAlive := currentBackend.IsAlive(sess.RuntimeName())
	var rollbackEnv map[string]string
	canRollback := false

	if isAlive {
		if currentEnv, currentErr := m.environmentForSession(oldSession); currentErr == nil {
			rollbackEnv = currentEnv
			canRollback = true
		}
	}

	if isAlive {
		if err := currentBackend.Kill(sess.RuntimeName()); err != nil {
			return fmt.Errorf("failed to kill existing session: %w", err)
		}
	}

	// Update session metadata
	sess = nextSession

	if err := targetBackend.Create(sess.RuntimeName(), newEnv, sess.Command, sess.Cwd, true); err != nil {
		if isAlive && canRollback {
			if rollbackErr := currentBackend.Create(sess.RuntimeName(), rollbackEnv, oldCommand, oldSession.Cwd, true); rollbackErr != nil {
				return fmt.Errorf("failed to recreate session with new settings: %w (rollback also failed: %v)", err, rollbackErr)
			}
			return fmt.Errorf("failed to recreate session with new settings: %w (restored previous session)", err)
		}
		return err
	}

	// Save updated metadata
	if err := m.store.Update(sess); err != nil {
		_ = targetBackend.Kill(sess.RuntimeName())
		if isAlive && canRollback {
			if rollbackErr := currentBackend.Create(sess.RuntimeName(), rollbackEnv, oldCommand, oldSession.Cwd, true); rollbackErr != nil {
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

// Detach disconnects all terminal clients attached to a runtime session while
// keeping the session and its metadata alive.
func (m *Manager) Detach(sessionID string) error {
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
	if !backend.IsAlive(runtimeName) {
		return nil
	}

	if err := backend.Detach(runtimeName); err != nil {
		return err
	}

	group := strings.TrimSpace(sess.Den)
	if group == "" {
		return nil
	}

	terminalID, err := m.defaultTerminalID()
	if err != nil {
		return err
	}

	if err := terminal.CloseGroupedWindow(terminalID, group); err != nil && !errors.Is(err, terminal.ErrCloseGroupedWindowUnsupported) {
		return err
	}

	return nil
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

	if err := backend.Create(runtimeName, env, command, sess.Cwd, true); err != nil {
		return err
	}

	// Refresh profile timestamp after successful restart
	if prof, profErr := m.profileMgr.Get(sess.ProfileID); profErr == nil {
		sess.ProfileUpdatedAt = prof.UpdatedAt
		_ = m.store.Update(sess)
	}

	return nil
}

// Attach opens the user's preferred terminal and attaches to a runtime session.
// Returns (profileChanged, error) where profileChanged indicates the profile was
// modified since the session was last started.
func (m *Manager) Attach(sessionID string) (bool, error) {
	terminalID, err := m.defaultTerminalID()
	if err != nil {
		return false, err
	}

	focused, focusErr := m.focusAttachedSession(sessionID, terminalID)
	if focusErr != nil {
		return false, focusErr
	}
	if focused {
		return false, nil
	}

	sess, launchSpec, profileChanged, err := m.resolveAttachLaunchSpec(sessionID)
	if err != nil {
		return false, err
	}

	err = terminal.Launch(terminalID, launchSpec)
	if err != nil {
		// Log error for debugging
		fmt.Printf("❌ Attach error [terminal=%s, session=%s]: %v\n", terminalID, sess.RuntimeName(), err)
		return false, err
	}
	if touchErr := m.store.RecordOpen(sess.ID); touchErr != nil {
		fmt.Printf("⚠️ failed to record session usage for [%s]: %v\n", sess.ID, touchErr)
	}
	return profileChanged, nil
}

// AttachWithTerminal opens a specific terminal and attaches to a runtime session.
func (m *Manager) AttachWithTerminal(sessionID, terminalID string) (bool, error) {
	focused, focusErr := m.focusAttachedSession(sessionID, terminalID)
	if focusErr != nil {
		return false, focusErr
	}
	if focused {
		return false, nil
	}

	sess, launchSpec, profileChanged, err := m.resolveAttachLaunchSpec(sessionID)
	if err != nil {
		return false, err
	}

	err = terminal.Launch(terminalID, launchSpec)
	if err != nil {
		// Log error for debugging
		fmt.Printf("❌ AttachWithTerminal error [terminal=%s, session=%s]: %v\n", terminalID, sess.RuntimeName(), err)
		return false, err
	}
	if touchErr := m.store.RecordOpen(sess.ID); touchErr != nil {
		fmt.Printf("⚠️ failed to record session usage for [%s]: %v\n", sess.ID, touchErr)
	}
	return profileChanged, nil
}

func (m *Manager) focusAttachedSession(sessionID, terminalID string) (bool, error) {
	if m.store == nil {
		return false, fmt.Errorf("session manager is not fully initialized")
	}
	if strings.TrimSpace(terminalID) == "" {
		return false, nil
	}

	sess, err := m.store.Get(sessionID)
	if err != nil {
		return false, fmt.Errorf("session not found: %w", err)
	}
	sess.NormalizeRuntimeMetadata()

	group := strings.TrimSpace(sess.Den)
	if group == "" {
		return false, nil
	}

	backend, err := m.backendForSession(sess)
	if err != nil {
		return false, err
	}

	runtimeName := sess.RuntimeName()
	if !backend.IsAlive(runtimeName) {
		return false, nil
	}
	// Only skip launching when this specific runtime session is already attached.
	// During OpenDen we iterate multiple sessions in the same den; merely finding
	// an existing grouped window is not enough to conclude the target session is
	// already open in a terminal tab.
	runtimeAttached := false
	if runtimeSessions, listErr := backend.List(); listErr == nil {
		for _, runtimeSession := range runtimeSessions {
			if runtimeSession.Name == runtimeName {
				runtimeAttached = runtimeSession.Attached > 0
				break
			}
		}
	}
	if !runtimeAttached {
		return false, nil
	}

	focused, err := terminal.FocusGroupedWindow(terminalID, group)
	if err != nil {
		if errors.Is(err, terminal.ErrFocusGroupedWindowUnsupported) {
			return false, nil
		}
		return false, err
	}
	if !focused {
		return false, nil
	}

	if touchErr := m.store.RecordOpen(sess.ID); touchErr != nil {
		fmt.Printf("⚠️ failed to record session usage for [%s]: %v\n", sess.ID, touchErr)
	}
	return true, nil
}

func (m *Manager) resolveAttachLaunchSpec(sessionID string) (Session, terminal.LaunchSpec, bool, error) {
	if m.store == nil || m.profileMgr == nil {
		return Session{}, terminal.LaunchSpec{}, false, fmt.Errorf("session manager is not fully initialized")
	}

	sess, err := m.store.Get(sessionID)
	if err != nil {
		return Session{}, terminal.LaunchSpec{}, false, fmt.Errorf("session not found: %w", err)
	}
	sess.NormalizeRuntimeMetadata()

	// Detect profile changes since session was last started
	profileChanged := false
	if prof, profErr := m.profileMgr.Get(sess.ProfileID); profErr == nil {
		if sess.ProfileUpdatedAt != "" && prof.UpdatedAt != "" && sess.ProfileUpdatedAt < prof.UpdatedAt {
			profileChanged = true
		}
	}

	backend, backendErr := m.backendForSession(sess)
	if backendErr != nil {
		return Session{}, terminal.LaunchSpec{}, false, backendErr
	}

	env, err := m.environmentForSession(sess)
	if err != nil {
		return Session{}, terminal.LaunchSpec{}, false, fmt.Errorf("failed to resolve attach env for [%s]: %w", sess.RuntimeName(), err)
	}

	runtimeName := sess.RuntimeName()
	if m.backendHealthy(backend, runtimeName) {
		if err := backend.SyncEnv(runtimeName, env); err != nil {
			fmt.Printf("⚠️ failed to refresh backend env for [%s]: %v\n", runtimeName, err)
		}
	} else {
		// Session is dead or all panes exited — kill stale session and restart
		// before attaching so the terminal doesn't open only to show "exited".
		if backend.IsAlive(runtimeName) {
			_ = backend.Kill(runtimeName)
		}
		command, cmdErr := m.commandForSession(sess)
		if cmdErr != nil {
			return Session{}, terminal.LaunchSpec{}, false, fmt.Errorf("failed to resolve command for [%s]: %w", runtimeName, cmdErr)
		}
		if createErr := backend.Create(runtimeName, env, command, sess.Cwd, true); createErr != nil {
			return Session{}, terminal.LaunchSpec{}, false, fmt.Errorf("session is not running and could not be restarted: %w", createErr)
		}
	}

	launchSpec, err := backend.BuildAttachSpec(runtimeName, env, sess.Den)
	if err != nil {
		return Session{}, terminal.LaunchSpec{}, false, err
	}
	launchSpec.Cwd = sess.Cwd

	return sess, launchSpec, profileChanged, nil
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

func (m *Manager) resolveBackend(requestedBackendID string) (SessionBackend, error) {
	backendID := strings.TrimSpace(requestedBackendID)
	if backendID == "" {
		return m.defaultBackend()
	}
	if m.backends != nil {
		if backend, ok := m.backends[backendID]; ok {
			return backend, nil
		}
	}
	return nil, fmt.Errorf("session backend %q is not registered", backendID)
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

func (m *Manager) backendHealthy(backend SessionBackend, runtimeName string) bool {
	if healthAware, ok := backend.(SessionHealthBackend); ok {
		return healthAware.IsHealthy(runtimeName)
	}
	return backend.IsAlive(runtimeName)
}

func (m *Manager) resolveLaunchConfig(req LaunchRequest) (LaunchConfig, string, error) {
	normalizedRunMode := strings.TrimSpace(req.RunMode)
	req.Command = strings.TrimSpace(req.Command)
	req.HostID = strings.TrimSpace(req.HostID)
	req.ScriptID = strings.TrimSpace(req.ScriptID)
	req.CodexConfigID = strings.TrimSpace(req.CodexConfigID)
	req.PluginConfigID = strings.TrimSpace(req.PluginConfigID)
	req.PluginData = trimStringMap(req.PluginData)

	if normalizedRunMode == "" {
		normalizedRunMode = m.inferRunMode(req.Command, req.HostID, req.CodexConfigID, req.ScriptID)
	}

	plugin, ok := m.plugins.get(normalizedRunMode)
	if !ok {
		return LaunchConfig{}, "", fmt.Errorf("unsupported run mode %q", normalizedRunMode)
	}

	cfg, err := plugin.Resolve(req)
	if err != nil {
		return LaunchConfig{}, "", err
	}
	cfg.PluginData = trimStringMap(cfg.PluginData)

	return cfg, normalizedRunMode, nil
}

func (m *Manager) commandForSession(sess Session) (string, error) {
	if sess.RunMode == "" {
		return strings.TrimSpace(sess.Command), nil
	}
	plugin, ok := m.plugins.get(sess.RunMode)
	if !ok {
		return strings.TrimSpace(sess.Command), nil
	}
	return plugin.Command(sess)
}

func (m *Manager) environmentForSession(sess Session) (map[string]string, error) {
	env, err := m.profileMgr.GetFullEnv(sess.ProfileID)
	if err != nil {
		return nil, err
	}
	if cwd := strings.TrimSpace(sess.Cwd); cwd != "" {
		env["MOLE_WORKSPACE"] = cwd
	}

	command, err := m.commandForSession(sess)
	if err != nil {
		return nil, err
	}

	env, _, err = m.prepareLaunchEnv(sess, env, command)
	if err != nil {
		return nil, err
	}
	return env, nil
}

func (m *Manager) prepareLaunchEnv(sess Session, env map[string]string, command string) (map[string]string, string, error) {
	plugin, ok := m.plugins.get(sess.RunMode)
	if !ok {
		return env, command, nil
	}
	return plugin.PrepareEnv(sess, env, command)
}

// SyncEnvForProfile pushes the latest profile env vars to all alive sessions
// that reference the given profile. Only new panes/windows inherit the changes.
func (m *Manager) SyncEnvForProfile(profileID string) {
	sessions, err := m.store.List()
	if err != nil {
		return
	}

	env, err := m.profileMgr.GetFullEnv(profileID)
	if err != nil {
		return
	}

	for _, sess := range sessions {
		if sess.ProfileID != profileID {
			continue
		}
		sess.NormalizeRuntimeMetadata()
		backend, backendErr := m.backendForSession(sess)
		if backendErr != nil {
			continue
		}
		if backend.IsAlive(sess.RuntimeName()) {
			_ = backend.SyncEnv(sess.RuntimeName(), env)
		}
	}
}

func trimStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	next := make(map[string]string, len(values))
	for key, value := range values {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		next[key] = strings.TrimSpace(value)
	}
	if len(next) == 0 {
		return nil
	}
	return next
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
func (m *Manager) PrepareBurrowImport(configs []WorkspaceSession, profileIDs map[string]struct{}, hostIDs map[string]struct{}, pluginConfigIDs map[string]struct{}) ([]Session, error) {
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
		scriptID := strings.TrimSpace(cfg.ScriptID)
		codexConfigID := strings.TrimSpace(cfg.CodexConfigID)
		pluginConfigID := strings.TrimSpace(cfg.PluginConfigID)
		pluginData := trimStringMap(cfg.PluginData)

		if runMode == "" {
			runMode = m.inferRunMode(command, hostID, codexConfigID, scriptID)
		}

		plugin, ok := m.plugins.get(runMode)
		if !ok {
			return nil, fmt.Errorf("session %q uses unsupported run mode %q", name, runMode)
		}

		if plugin.RequiresPluginConfig() {
			if pluginConfigID == "" {
				return nil, fmt.Errorf("session %q uses %q without a plugin config", name, runMode)
			}
			if _, exists := pluginConfigIDs[pluginConfigID]; !exists {
				return nil, fmt.Errorf("session %q references unknown plugin config %q", name, pluginConfigID)
			}
		} else {
			launchCfg, err := plugin.Validate(LaunchRequest{
				Command:        command,
				RunMode:        runMode,
				HostID:         hostID,
				ScriptID:       scriptID,
				CodexConfigID:  codexConfigID,
				PluginConfigID: pluginConfigID,
				PluginData:     pluginData,
			})
			if err != nil {
				return nil, fmt.Errorf("session %q: %w", name, err)
			}
			command = launchCfg.Command
			hostID = launchCfg.HostID
			scriptID = launchCfg.ScriptID
			codexConfigID = launchCfg.CodexConfigID
			pluginConfigID = launchCfg.PluginConfigID
			pluginData = launchCfg.PluginData
		}

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
			Cwd:             strings.TrimSpace(cfg.Cwd),
			Command:         command,
			RunMode:         runMode,
			HostID:          hostID,
			ScriptID:        scriptID,
			CodexConfigID:   codexConfigID,
			PluginConfigID:  pluginConfigID,
			PluginData:      pluginData,
			Den:             strings.TrimSpace(cfg.Den),
			CreatedAt:       createdAt,
		})
	}

	return prepared, nil
}

func (m *Manager) orderDenSessions(den string, sessions []SessionStatus) ([]SessionStatus, error) {
	order, err := m.store.GetDenOrder(den)
	if err != nil {
		return nil, err
	}

	sessionByID := make(map[string]SessionStatus, len(sessions))
	for _, status := range sessions {
		sessionByID[status.ID] = status
	}

	ordered := make([]SessionStatus, 0, len(sessions))
	seen := make(map[string]struct{}, len(sessions))
	for _, sessionID := range order {
		status, ok := sessionByID[sessionID]
		if !ok {
			continue
		}
		ordered = append(ordered, status)
		seen[sessionID] = struct{}{}
	}

	for _, status := range sessions {
		if _, ok := seen[status.ID]; ok {
			continue
		}
		ordered = append(ordered, status)
	}

	return ordered, nil
}

func (m *Manager) defaultTerminalID() (string, error) {
	settings, err := config.LoadSettings()
	if err != nil {
		settings = &config.Settings{}
	}

	terminalID := settings.DefaultTerminal
	if terminalID == "" {
		if bestTerminal := terminal.GetDefaultTerminal(); bestTerminal != nil {
			terminalID = bestTerminal.ID
		} else {
			terminalID = terminal.DefaultTerminalID()
		}
	}

	return terminalID, nil
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

func (m *Manager) registerPresetPlugins(resolver pluginConfigResolver) {
	m.plugins.register(NewK8sPodPlugin(resolver))
	m.plugins.register(NewTmuxAttachPlugin(resolver))
	m.plugins.register(NewRemoteTmuxPlugin(resolver))
}

func (m *Manager) inferRunMode(command, hostID, codexConfigID, scriptID string) string {
	switch {
	case scriptID != "":
		return RunModeScript
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
