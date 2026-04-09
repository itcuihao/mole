package session

import (
	"strings"
	"time"
)

const (
	RunModeShell  = "shell"
	RunModeHost   = "host"
	RunModeCustom = "custom"
)

// Session represents stored metadata for a runtime session.
type Session struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	ProfileID       string    `json:"profile_id"`
	BackendID       string    `json:"backend_id,omitempty"`
	TmuxSessionName string    `json:"tmux_session_name"`
	Command         string    `json:"command"` // Optional command to run (e.g., "claude")
	RunMode         string    `json:"run_mode,omitempty"`
	HostID          string    `json:"host_id,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

func (s Session) EffectiveBackendID() string {
	if backendID := strings.TrimSpace(s.BackendID); backendID != "" {
		return backendID
	}
	return BackendIDTmux
}

func (s Session) RuntimeName() string {
	return strings.TrimSpace(s.TmuxSessionName)
}

func (s *Session) NormalizeRuntimeMetadata() {
	s.BackendID = s.EffectiveBackendID()
	s.TmuxSessionName = s.RuntimeName()
}

// SessionStatus combines stored session data with live backend status.
type SessionStatus struct {
	Session
	ProfileName  string `json:"profile_name"`
	ProfileColor string `json:"profile_color"`
	Attached     bool   `json:"attached"`
	Alive        bool   `json:"alive"`
	Windows      int    `json:"windows"`
}
