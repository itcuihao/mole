package main

import (
	"context"
	"log"

	"mole/internal/config"
	"mole/internal/profile"
	"mole/internal/session"
)

// App struct holds the application state and managers.
type App struct {
	ctx        context.Context
	profileMgr *profile.Manager
	sessionMgr *session.Manager
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

	a.profileMgr = profile.NewManager(config.ProfilesPath())
	a.sessionMgr = session.NewManager(config.SessionsPath(), a.profileMgr)
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

// CreateSession creates a new tmux session from a profile.
func (a *App) CreateSession(profileID, name, command string) error {
	return a.sessionMgr.Create(profileID, name, command)
}

// ListSessions returns all sessions with live status.
func (a *App) ListSessions() ([]session.SessionStatus, error) {
	return a.sessionMgr.ListWithStatus()
}

// AttachSession opens Terminal.app and attaches to a tmux session.
func (a *App) AttachSession(tmuxName string) error {
	return a.sessionMgr.Attach(tmuxName)
}

// UpdateSession updates a session's profile and command, recreating the tmux session.
func (a *App) UpdateSession(sessionID, profileID, command string) error {
	return a.sessionMgr.Update(sessionID, profileID, command)
}

// KillSession terminates a tmux session.
func (a *App) KillSession(tmuxName string) error {
	return a.sessionMgr.Kill(tmuxName)
}
