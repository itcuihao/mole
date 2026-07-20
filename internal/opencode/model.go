package opencode

// Config represents one opencode.json template managed by Mole.
//
// opencode has no CODEX_HOME-style config-dir isolation (no --config-dir and
// no OPENCODE_HOME), so unlike codex the opencode.json content is stored
// inline here and materialized into a session's cwd at launch time. opencode
// then reads it as project-level config, which overrides the user's global
// ~/.config/opencode configuration.
type Config struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	ConfigJSON string `json:"config_json"` // opencode.json content; may use $ENV placeholders opencode expands itself
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

// SaveRequest carries editable opencode config content from the UI.
type SaveRequest struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	ConfigJSON string `json:"config_json"`
}
