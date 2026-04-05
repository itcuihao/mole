package session

import (
	"fmt"
	"regexp"

	"mole/internal/config"
	"mole/internal/profile"
	"mole/internal/terminal"
)

var validName = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// Manager orchestrates session operations across store, tmux, and profiles.
type Manager struct {
	store      *Store
	profileMgr *profile.Manager
}

// NewManager creates a new session Manager.
func NewManager(storePath string, profileMgr *profile.Manager) *Manager {
	return &Manager{
		store:      NewStore(storePath),
		profileMgr: profileMgr,
	}
}

// Create creates a new tmux session with the environment from a profile.
func (m *Manager) Create(profileID, sessionName, command string) error {
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

	// Resolve full environment
	env, err := m.profileMgr.GetFullEnv(profileID)
	if err != nil {
		return fmt.Errorf("failed to resolve profile env: %w", err)
	}

	// Create tmux session
	if err := CreateTmuxSession(tmuxName, env, command); err != nil {
		return err
	}

	// Save session metadata
	sess := Session{
		Name:            sessionName,
		ProfileID:       profileID,
		TmuxSessionName: tmuxName,
		Command:         command,
	}
	return m.store.Save(sess)
}

// ListWithStatus returns all sessions with live tmux status.
// Cleans up stale entries where tmux session no longer exists.
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
	var staleIDs []string

	for _, sess := range sessions {
		ts, alive := tmuxMap[sess.TmuxSessionName]

		if !alive {
			staleIDs = append(staleIDs, sess.ID)
			continue
		}

		status := SessionStatus{
			Session:  sess,
			Alive:    true,
			Attached: ts.Attached > 0,
			Windows:  ts.Windows,
		}

		if p, ok := profileMap[sess.ProfileID]; ok {
			status.ProfileName = p.Name
			status.ProfileColor = p.Color
		}

		result = append(result, status)
	}

	// Clean up stale sessions
	for _, id := range staleIDs {
		_ = m.store.Delete(id)
	}

	return result, nil
}

// Update updates an existing session's profile and/or command.
// If the session is alive, it will be recreated with new settings.
func (m *Manager) Update(sessionID, profileID, command string) error {
	// Get current session
	sess, err := m.store.Get(sessionID)
	if err != nil {
		return err
	}

	// Check if tmux session is alive
	isAlive := IsTmuxSessionAlive(sess.TmuxSessionName)

	// If alive, kill it first
	if isAlive {
		if err := KillTmuxSession(sess.TmuxSessionName); err != nil {
			return fmt.Errorf("failed to kill existing session: %w", err)
		}
	}

	// Update session metadata
	sess.ProfileID = profileID
	sess.Command = command

	// Resolve new environment
	env, err := m.profileMgr.GetFullEnv(profileID)
	if err != nil {
		return fmt.Errorf("failed to resolve profile env: %w", err)
	}

	// Recreate tmux session
	if err := CreateTmuxSession(sess.TmuxSessionName, env, command); err != nil {
		return err
	}

	// Save updated metadata
	return m.store.Update(sess)
}

// Kill terminates a tmux session and removes it from the store.
func (m *Manager) Kill(tmuxName string) error {
	if err := KillTmuxSession(tmuxName); err != nil {
		return err
	}
	return m.store.DeleteByTmuxName(tmuxName)
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
