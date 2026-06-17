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
	RunModeTmuxAttach = "tmux_attach"
	RunModeRemoteTmux = "remote_tmux"
	RunModeScript     = "script"
)

// Session represents stored metadata for a runtime session.
type Session struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	ProfileID        string            `json:"profile_id"`
	ProfileUpdatedAt string            `json:"profile_updated_at,omitempty"`
	BackendID        string            `json:"backend_id,omitempty"`
	TmuxSessionName  string            `json:"tmux_session_name"`
	Cwd              string            `json:"cwd,omitempty"`
	Command          string            `json:"command"` // Optional command to run (e.g., "claude")
	RunMode          string            `json:"run_mode,omitempty"`
	HostID           string            `json:"host_id,omitempty"`
	ScriptID         string            `json:"script_id,omitempty"`
	CodexConfigID    string            `json:"codex_config_id,omitempty"`
	PluginConfigID   string            `json:"plugin_config_id,omitempty"`
	PluginData       map[string]string `json:"plugin_data,omitempty"`
	Den              string            `json:"den,omitempty"`
	CreatedAt        string            `json:"created_at"`
	OpenCount        int               `json:"open_count,omitempty"`
	LastOpenedAt     string            `json:"last_opened_at,omitempty"`
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

// RuntimeNameForSession builds the runtime (tmux) session identifier for a
// Burrow. The format is `mole-<id8>-<slug>`:
//
//   - id8 is the first 8 hex chars of the Burrow's UUID — short, stable
//     across renames, and unique enough for typical Mole usage.
//   - slug is a 1-3 token shortname derived from the Burrow's user-facing
//     name, so `tmux list-sessions` stays human-readable when scanning.
//
// `name` may be empty; in that case the slug segment is omitted.
func RuntimeNameForSession(sessionID, name string) string {
	idPart := ""
	if len(sessionID) >= 8 {
		idPart = strings.ToLower(sessionID[:8])
	}
	slug := runtimeSlug(name)
	if idPart == "" && slug == "" {
		return "mole"
	}
	if slug == "" {
		return "mole-" + idPart
	}
	if idPart == "" {
		return "mole-" + slug
	}
	return "mole-" + idPart + "-" + slug
}

// runtimeSlug takes a Burrow's user-facing name and produces a short, shell-
// safe segment suitable for a tmux session name. Examples:
//
//	"mimo-mole"          -> "mole"
//	"es-search-glm-ma"   -> "es"
//	"firefly-mimo-qwen"  -> "firefly"
//
// Falls back to "burrow" if the input has no usable characters.
func runtimeSlug(name string) string {
	cleaned := strings.ToLower(strings.TrimSpace(name))
	if cleaned == "" {
		return ""
	}
	first := strings.SplitN(cleaned, "-", 2)[0]
	out := make([]rune, 0, len(first))
	for _, r := range first {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		return "burrow"
	}
	if len(out) > 12 {
		out = out[:12]
	}
	return string(out)
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
		Cwd:            s.Cwd,
		Command:        s.Command,
		RunMode:        s.RunMode,
		HostID:         s.HostID,
		ScriptID:       s.ScriptID,
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
	BackendID      string            `json:"backend_id,omitempty"`
	Cwd            string            `json:"cwd,omitempty"`
	Command        string            `json:"command,omitempty"`
	RunMode        string            `json:"run_mode,omitempty"`
	HostID         string            `json:"host_id,omitempty"`
	ScriptID       string            `json:"script_id,omitempty"`
	CodexConfigID  string            `json:"codex_config_id,omitempty"`
	PluginConfigID string            `json:"plugin_config_id,omitempty"`
	PluginData     map[string]string `json:"plugin_data,omitempty"`
	Den            string            `json:"den,omitempty"`
}

// SessionUpdateRequest is the V2 payload for updating a session.
type SessionUpdateRequest struct {
	SessionID      string            `json:"session_id"`
	ProfileID      string            `json:"profile_id"`
	BackendID      string            `json:"backend_id,omitempty"`
	Cwd            string            `json:"cwd,omitempty"`
	Command        string            `json:"command,omitempty"`
	RunMode        string            `json:"run_mode,omitempty"`
	HostID         string            `json:"host_id,omitempty"`
	ScriptID       string            `json:"script_id,omitempty"`
	CodexConfigID  string            `json:"codex_config_id,omitempty"`
	PluginConfigID string            `json:"plugin_config_id,omitempty"`
	PluginData     map[string]string `json:"plugin_data,omitempty"`
	Den            string            `json:"den,omitempty"`
}

type OpenDenFailure struct {
	SessionID string `json:"session_id"`
	Name      string `json:"name"`
	Error     string `json:"error"`
}

type OpenDenResult struct {
	Opened  []string         `json:"opened"`
	Skipped []string         `json:"skipped"`
	Failed  []OpenDenFailure `json:"failed"`
}

// ProfileReference summarizes one session that depends on a profile.
type ProfileReference struct {
	SessionID string `json:"session_id"`
	Name      string `json:"name"`
}
