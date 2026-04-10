package session

// WorkspaceSession stores the portable, non-runtime portion of a session.
type WorkspaceSession struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ProfileID string `json:"profile_id"`
	BackendID string `json:"backend_id,omitempty"`
	Command   string `json:"command,omitempty"`
	RunMode   string `json:"run_mode,omitempty"`
	HostID    string `json:"host_id,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
}
