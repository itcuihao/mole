package session

import "time"

const (
	RunModeShell  = "shell"
	RunModeHost   = "host"
	RunModeCustom = "custom"
)

// Session represents stored metadata for a tmux session.
type Session struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	ProfileID       string    `json:"profile_id"`
	TmuxSessionName string    `json:"tmux_session_name"`
	Command         string    `json:"command"` // Optional command to run (e.g., "claude")
	RunMode         string    `json:"run_mode,omitempty"`
	HostID          string    `json:"host_id,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// SessionStatus combines stored session data with live tmux status.
type SessionStatus struct {
	Session
	ProfileName  string `json:"profile_name"`
	ProfileColor string `json:"profile_color"`
	Attached     bool   `json:"attached"`
	Alive        bool   `json:"alive"`
	Windows      int    `json:"windows"`
}
