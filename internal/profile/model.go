package profile

// Profile represents an environment configuration set.
type Profile struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Description    string            `json:"description"`
	Color          string            `json:"color"`
	DefaultCommand string            `json:"default_command,omitempty"`
	EnvVars        map[string]string `json:"env_vars"`
	SecretKeys     []string          `json:"secret_keys"`
	CreatedAt      string            `json:"created_at"`
	UpdatedAt      string            `json:"updated_at,omitempty"`
}
