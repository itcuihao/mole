package codex

// Config represents one selectable isolated Codex home.
type Config struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	HomeDir    string `json:"home_dir"`
	ConfigPath string `json:"config_path"`
	AuthPath   string `json:"auth_path"`
	AuthExists bool   `json:"auth_exists"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

// SaveRequest carries editable Codex config content from the UI.
type SaveRequest struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	ConfigToml  string `json:"config_toml"`
	AuthJSON    string `json:"auth_json,omitempty"`
	ReplaceAuth bool   `json:"replace_auth,omitempty"`
}
