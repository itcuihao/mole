package scriptcfg

// Config represents one reusable local script preset.
type Config struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Platform    string `json:"platform,omitempty"`
	Command     string `json:"command"`
	Builtin     bool   `json:"builtin,omitempty"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// SaveRequest carries editable script fields from the UI.
type SaveRequest struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Platform    string `json:"platform,omitempty"`
	Command     string `json:"command"`
}

// CommandTestResult reports launch-command preflight validation.
type CommandTestResult struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}
