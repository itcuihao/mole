package session

// WorkspaceSession stores the portable, non-runtime portion of a session.
type WorkspaceSession struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
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
	CreatedAt      string            `json:"created_at,omitempty"`
}
