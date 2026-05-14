package session

import (
	"strings"
)

const (
	RunModeShell      = "shell"
	RunModeHost       = "host"
	RunModeCustom     = "custom"
	RunModeCodex      = "codex"
	RunModeK8sPod     = "k8s_pod"
	RunModeConda      = "conda"
	RunModeSSHConfig  = "ssh_config"
	RunModeTmuxAttach = "tmux_attach"
	RunModeRemoteTmux = "remote_tmux"
)

// Session represents stored metadata for a runtime session.
type Session struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	ProfileID       string            `json:"profile_id"`
	BackendID       string            `json:"backend_id,omitempty"`
	TmuxSessionName string            `json:"tmux_session_name"`
	Command         string            `json:"command"` // Optional command to run (e.g., "claude")
	RunMode         string            `json:"run_mode,omitempty"`
	HostID          string            `json:"host_id,omitempty"`
	CodexConfigID   string            `json:"codex_config_id,omitempty"`
	PluginConfigID  string            `json:"plugin_config_id,omitempty"`
	PluginData      map[string]string `json:"plugin_data,omitempty"`
	Den             string            `json:"den,omitempty"`
	CreatedAt       string            `json:"created_at"`
	OpenCount       int               `json:"open_count,omitempty"`
	LastOpenedAt    string            `json:"last_opened_at,omitempty"`
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

func RuntimeNameForSessionName(name string) string {
	return "mole-" + strings.TrimSpace(name)
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

func (s Session) WorkspaceConfig() WorkspaceSession {
	return WorkspaceSession{
		ID:             s.ID,
		Name:           s.Name,
		ProfileID:      s.ProfileID,
		BackendID:      s.EffectiveBackendID(),
		Command:        s.Command,
		RunMode:        s.RunMode,
		HostID:         s.HostID,
		CodexConfigID:  s.CodexConfigID,
		PluginConfigID: s.PluginConfigID,
		PluginData:     s.PluginData,
		Den:            s.Den,
		CreatedAt:      s.CreatedAt,
	}
}

// SessionLaunchRequest is the V2 payload for creating a session.
type SessionLaunchRequest struct {
	ProfileID      string            `json:"profile_id"`
	Name           string            `json:"name"`
	Command        string            `json:"command,omitempty"`
	RunMode        string            `json:"run_mode,omitempty"`
	HostID         string            `json:"host_id,omitempty"`
	CodexConfigID  string            `json:"codex_config_id,omitempty"`
	PluginConfigID string            `json:"plugin_config_id,omitempty"`
	PluginData     map[string]string `json:"plugin_data,omitempty"`
	Den            string            `json:"den,omitempty"`
}

// SessionUpdateRequest is the V2 payload for updating a session.
type SessionUpdateRequest struct {
	SessionID      string            `json:"session_id"`
	ProfileID      string            `json:"profile_id"`
	Command        string            `json:"command,omitempty"`
	RunMode        string            `json:"run_mode,omitempty"`
	HostID         string            `json:"host_id,omitempty"`
	CodexConfigID  string            `json:"codex_config_id,omitempty"`
	PluginConfigID string            `json:"plugin_config_id,omitempty"`
	PluginData     map[string]string `json:"plugin_data,omitempty"`
	Den            string            `json:"den,omitempty"`
}
