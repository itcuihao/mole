package pluginconfig

// Config stores a reusable launch plugin preset.
type Config struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	PluginID  string            `json:"plugin_id"`
	Settings  map[string]string `json:"settings,omitempty"`
	CreatedAt string            `json:"created_at"`
	UpdatedAt string            `json:"updated_at"`
}

// SaveRequest carries editable plugin preset fields from the UI.
type SaveRequest struct {
	ID       string            `json:"id"`
	Name     string            `json:"name"`
	PluginID string            `json:"plugin_id"`
	Settings map[string]string `json:"settings,omitempty"`
}
