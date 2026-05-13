package docker

// Config represents one Docker container launch configuration.
type Config struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Image     string `json:"image"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// SaveRequest carries editable Docker config fields from the UI.
type SaveRequest struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Image string `json:"image"`
}
