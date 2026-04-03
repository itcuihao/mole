package profile

import "time"

// Profile represents an environment configuration set.
type Profile struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Color       string            `json:"color"`
	EnvVars     map[string]string `json:"env_vars"`
	SecretKeys  []string          `json:"secret_keys"`
	CreatedAt   time.Time         `json:"created_at"`
}
