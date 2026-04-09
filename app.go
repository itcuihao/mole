package main

import (
	"context"
	"log"
	"strings"

	"mole/internal/config"
	"mole/internal/inventory"
	"mole/internal/profile"
	"mole/internal/session"
	"mole/internal/terminal"
)

// App struct holds the application state and managers.
type App struct {
	ctx        context.Context
	profileMgr *profile.Manager
	sessionMgr *session.Manager
	invMgr     *inventory.Manager
}

// NewApp creates a new App instance.
func NewApp() *App {
	return &App{}
}

// startup initializes the application.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	if err := config.EnsureDir(); err != nil {
		log.Printf("Failed to create config directory: %v", err)
	}

	// Initialize settings.json if it doesn't exist
	if err := config.InitSettings(); err != nil {
		log.Printf("Failed to initialize settings: %v", err)
	}

	a.profileMgr = profile.NewManager(config.ProfilesPath())
	a.invMgr = inventory.NewManager(config.HostsPath())
	a.sessionMgr = session.NewPlatformManager(config.SessionsPath(), a.profileMgr, a.invMgr)
}

// ListProfiles returns all profiles.
func (a *App) ListProfiles() ([]profile.Profile, error) {
	return a.profileMgr.List()
}

// SaveProfile saves a profile with optional secrets.
func (a *App) SaveProfile(p profile.Profile, secrets map[string]string) error {
	return a.profileMgr.Save(p, secrets)
}

// DeleteProfile removes a profile by ID.
func (a *App) DeleteProfile(id string) error {
	return a.profileMgr.Delete(id)
}

// CreateSession creates a new runtime session from a profile.
func (a *App) CreateSession(profileID, name, command string) error {
	return a.sessionMgr.Create(profileID, name, command, inferRunMode(command), "")
}

// CreateSessionWithOptions creates a new runtime session with explicit launch metadata.
func (a *App) CreateSessionWithOptions(profileID, name, command, runMode, hostID string) error {
	return a.sessionMgr.Create(profileID, name, command, runMode, hostID)
}

// ListSessions returns all sessions with live status.
func (a *App) ListSessions() ([]session.SessionStatus, error) {
	return a.sessionMgr.ListWithStatus()
}

// AttachSession opens the user's preferred terminal and attaches to a session.
func (a *App) AttachSession(sessionID string) error {
	return a.sessionMgr.Attach(sessionID)
}

// AttachSessionWithTerminal opens a specific terminal and attaches to a session.
func (a *App) AttachSessionWithTerminal(sessionID, terminalID string) error {
	return a.sessionMgr.AttachWithTerminal(sessionID, terminalID)
}

// UpdateSession updates a session's profile and command, recreating the runtime session.
func (a *App) UpdateSession(sessionID, profileID, command string) error {
	return a.sessionMgr.Update(sessionID, profileID, command, inferRunMode(command), "")
}

// UpdateSessionWithOptions updates a session with explicit launch metadata.
func (a *App) UpdateSessionWithOptions(sessionID, profileID, command, runMode, hostID string) error {
	return a.sessionMgr.Update(sessionID, profileID, command, runMode, hostID)
}

// KillSession terminates a session and removes it from storage.
func (a *App) KillSession(sessionID string) error {
	return a.sessionMgr.Kill(sessionID)
}

// RestartSession recreates a dead runtime session using its stored configuration.
func (a *App) RestartSession(sessionID string) error {
	return a.sessionMgr.Restart(sessionID)
}

// GetInstalledTerminals returns all installed terminal applications.
func (a *App) GetInstalledTerminals() []terminal.TerminalApp {
	return terminal.DetectInstalled()
}

// GetDefaultTerminal returns the user's configured default terminal.
func (a *App) GetDefaultTerminal() (string, error) {
	settings, err := config.LoadSettings()
	if err != nil {
		return "", err
	}

	// If no default set, auto-detect best available
	if settings.DefaultTerminal == "" {
		bestTerminal := terminal.GetDefaultTerminal()
		if bestTerminal != nil {
			return bestTerminal.ID, nil
		}
		return terminal.DefaultTerminalID(), nil
	}

	return settings.DefaultTerminal, nil
}

// SetDefaultTerminal sets the user's default terminal.
func (a *App) SetDefaultTerminal(terminalID string) error {
	settings, err := config.LoadSettings()
	if err != nil {
		settings = &config.Settings{}
	}

	settings.DefaultTerminal = terminalID
	return config.SaveSettings(settings)
}

// GetInventory returns the current host inventory.
func (a *App) GetInventory() (inventory.Inventory, error) {
	return a.invMgr.GetInventory()
}

// SaveInventory replaces the entire host inventory.
func (a *App) SaveInventory(inv inventory.Inventory) error {
	return a.invMgr.SaveInventory(inv)
}

// SaveInventoryDefaults updates default SSH values.
func (a *App) SaveInventoryDefaults(defaults inventory.HostDefaults) error {
	return a.invMgr.SaveDefaults(defaults)
}

// SaveHost creates or updates a host.
func (a *App) SaveHost(h inventory.Host) error {
	return a.invMgr.SaveHost(h)
}

// DeleteHost removes a host by ID.
func (a *App) DeleteHost(id string) error {
	return a.invMgr.DeleteHost(id)
}

// SaveHostGroup creates or updates a host group.
func (a *App) SaveHostGroup(g inventory.HostGroup) error {
	return a.invMgr.SaveGroup(g)
}

// DeleteHostGroup removes a host group by ID.
func (a *App) DeleteHostGroup(id string) error {
	return a.invMgr.DeleteGroup(id)
}

func inferRunMode(command string) string {
	if strings.TrimSpace(command) == "" {
		return session.RunModeShell
	}
	return session.RunModeCustom
}
