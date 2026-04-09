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

// Manager orchestrates session operations across store, tmux, and profiles.
type Manager struct {
	store      *Store
	profileMgr *profile.Manager
	invMgr     *inventory.Manager
}

// NewManager creates a new session Manager.
func NewManager(storePath string, profileMgr *profile.Manager, invMgr *inventory.Manager) *Manager {
	return &Manager{
		store:      NewStore(storePath),
		profileMgr: profileMgr,
		invMgr:     invMgr,
	}
}

// Create creates a new tmux session with the environment from a profile.
func (m *Manager) Create(profileID, sessionName, command, runMode, hostID string) error {
	if !validName.MatchString(sessionName) {
		return fmt.Errorf("session name must contain only letters, digits, underscores, and dashes")
	}

	// Check tmux is available
	if !TmuxAvailable() {
		return fmt.Errorf("tmux is not installed. Install with: brew install tmux")
	}

	// Check if session name already exists in tmux
	tmuxName := "mole-" + sessionName
	if IsTmuxSessionAlive(tmuxName) {
		return fmt.Errorf("tmux session %q already exists", tmuxName)
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

	// Create tmux session
	if err := CreateTmuxSession(tmuxName, env, resolvedCommand); err != nil {
		return err
	}

	// Save session metadata
	sess := Session{
		Name:            sessionName,
		ProfileID:       profileID,
		TmuxSessionName: tmuxName,
		Command:         resolvedCommand,
		RunMode:         normalizedRunMode,
		HostID:          normalizedHostID,
	}
	return m.store.Save(sess)
}

// ListWithStatus returns all sessions with live tmux status.
// Sessions are persisted even if tmux process is dead (e.g., after reboot).
func (m *Manager) ListWithStatus() ([]SessionStatus, error) {
	sessions, err := m.store.List()
	if err != nil {
		return nil, err
	}

	// Get live tmux sessions
	tmuxSessions, _ := ListTmuxSessions()
	tmuxMap := make(map[string]TmuxSessionInfo)
	for _, ts := range tmuxSessions {
		tmuxMap[ts.Name] = ts
	}

	// Load profiles for name/color lookup
	profiles, _ := m.profileMgr.List()
	profileMap := make(map[string]profile.Profile)
	for _, p := range profiles {
		profileMap[p.ID] = p
	}

	result := make([]SessionStatus, 0)

	for _, sess := range sessions {
		ts, alive := tmuxMap[sess.TmuxSessionName]

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

	// Check if tmux session is alive
	isAlive := IsTmuxSessionAlive(sess.TmuxSessionName)
	var rollbackEnv map[string]string
	canRollback := false

	if isAlive {
		if currentEnv, currentErr := m.profileMgr.GetFullEnv(oldProfileID); currentErr == nil {
			rollbackEnv = currentEnv
			canRollback = true
		}
	}

	// If alive, kill it first
	if isAlive {
		if err := KillTmuxSession(sess.TmuxSessionName); err != nil {
			return fmt.Errorf("failed to kill existing session: %w", err)
		}
	}

	// Update session metadata
	sess.ProfileID = profileID
	sess.Command = resolvedCommand
	sess.RunMode = normalizedRunMode
	sess.HostID = normalizedHostID

	// Recreate tmux session
	if err := CreateTmuxSession(sess.TmuxSessionName, newEnv, resolvedCommand); err != nil {
		if isAlive && canRollback {
			if rollbackErr := CreateTmuxSession(sess.TmuxSessionName, rollbackEnv, oldCommand); rollbackErr != nil {
				return fmt.Errorf("failed to recreate session with new settings: %w (rollback also failed: %v)", err, rollbackErr)
			}
			return fmt.Errorf("failed to recreate session with new settings: %w (restored previous session)", err)
		}
		return err
	}

	// Save updated metadata
	if err := m.store.Update(sess); err != nil {
		_ = KillTmuxSession(sess.TmuxSessionName)
		if isAlive && canRollback {
			if rollbackErr := CreateTmuxSession(sess.TmuxSessionName, rollbackEnv, oldCommand); rollbackErr != nil {
				return fmt.Errorf("failed to persist session update: %w (rollback also failed: %v)", err, rollbackErr)
			}
			return fmt.Errorf("failed to persist session update: %w (restored previous session)", err)
		}
		return err
	}

	return nil
}

// Kill terminates a tmux session when present and removes it from the store.
func (m *Manager) Kill(tmuxName string) error {
	if err := KillTmuxSession(tmuxName); err != nil {
		if !IsTmuxSessionAlive(tmuxName) {
			return m.store.DeleteByTmuxName(tmuxName)
		}
		return err
	}
	return m.store.DeleteByTmuxName(tmuxName)
}

// Restart recreates a dead tmux session using its stored configuration.
func (m *Manager) Restart(sessionID string) error {
	// Get session metadata
	sess, err := m.store.Get(sessionID)
	if err != nil {
		return fmt.Errorf("session not found: %w", err)
	}

	// Check if already alive
	if IsTmuxSessionAlive(sess.TmuxSessionName) {
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

	// Recreate tmux session
	return CreateTmuxSession(sess.TmuxSessionName, env, command)
}

// Attach opens the user's preferred terminal and attaches to a tmux session.
func (m *Manager) Attach(tmuxName string) error {
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
			terminalID = terminal.TerminalApple
		}
	}

	err = terminal.AttachSession(terminalID, tmuxName)
	if err != nil {
		// Log error for debugging
		fmt.Printf("❌ Attach error [terminal=%s, session=%s]: %v\n", terminalID, tmuxName, err)
	}
	return err
}

// AttachWithTerminal opens a specific terminal and attaches to a tmux session.
func (m *Manager) AttachWithTerminal(tmuxName, terminalID string) error {
	err := terminal.AttachSession(terminalID, tmuxName)
	if err != nil {
		// Log error for debugging
		fmt.Printf("❌ AttachWithTerminal error [terminal=%s, session=%s]: %v\n", terminalID, tmuxName, err)
	}
	return err
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
