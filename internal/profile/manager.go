package profile

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

// Manager coordinates profile file storage plus env normalization rules.
type Manager struct {
	store *Store
}

// NewManager creates a new profile Manager.
func NewManager(storePath string) *Manager {
	return &Manager{
		store: NewStore(storePath),
	}
}

// List returns all profiles.
func (m *Manager) List() ([]Profile, error) {
	profiles, err := m.store.List()
	if err != nil {
		return make([]Profile, 0), err
	}
	if profiles == nil {
		return make([]Profile, 0), nil
	}
	return profiles, nil
}

// Get returns a profile by ID.
func (m *Manager) Get(id string) (Profile, error) {
	return m.store.Get(id)
}

// Save stores a profile. All env vars (including secrets) go to JSON.
// The secrets map contains key->value pairs for keys listed in profile.SecretKeys.
// SecretKeys is just a UI hint to hide input, not separate storage.
func (m *Manager) Save(p Profile, secrets map[string]string) error {
	normalizedEnvVars, normalizedSecretKeys, normalizedSecrets, err := NormalizeProfileEnv(p.EnvVars, p.SecretKeys, secrets)
	if err != nil {
		return err
	}

	p.EnvVars = normalizedEnvVars
	p.SecretKeys = normalizedSecretKeys

	// Merge secrets into EnvVars (all stored in JSON now)
	for key, value := range normalizedSecrets {
		if value != "" {
			p.EnvVars[key] = value
		}
	}

	// Store profile with all values in JSON
	return m.store.Save(p)
}

// Delete removes a profile.
func (m *Manager) Delete(id string) error {
	return m.store.Delete(id)
}

// PrepareImport validates and normalizes imported profiles without persisting them.
func (m *Manager) PrepareImport(profiles []Profile) ([]Profile, error) {
	if profiles == nil {
		return []Profile{}, nil
	}

	normalized := make([]Profile, 0, len(profiles))
	seenIDs := make(map[string]struct{}, len(profiles))

	for _, p := range profiles {
		envVars, secretKeys, _, err := NormalizeProfileEnv(p.EnvVars, p.SecretKeys, nil)
		if err != nil {
			name := strings.TrimSpace(p.Name)
			if name == "" {
				name = "<unnamed profile>"
			}
			return nil, errForProfile(name, err)
		}

		p.Name = strings.TrimSpace(p.Name)
		p.Description = strings.TrimSpace(p.Description)
		p.EnvVars = envVars
		p.SecretKeys = secretKeys

		if p.ID == "" {
			p.ID = uuid.New().String()
		}
		if _, exists := seenIDs[p.ID]; exists {
			return nil, errForProfile(p.Name, errDuplicateProfileID(p.ID))
		}
		seenIDs[p.ID] = struct{}{}

		if strings.TrimSpace(p.CreatedAt) == "" {
			p.CreatedAt = time.Now().Format(time.RFC3339Nano)
		}

		normalized = append(normalized, p)
	}

	return normalized, nil
}

// ReplaceAll overwrites the full profile set.
func (m *Manager) ReplaceAll(profiles []Profile) error {
	return m.store.ReplaceAll(profiles)
}

// GetFullEnv returns all environment variables for a profile.
// All values are stored in EnvVars (no Keychain), SecretKeys is just a UI hint.
func (m *Manager) GetFullEnv(profileID string) (map[string]string, error) {
	p, err := m.store.Get(profileID)
	if err != nil {
		return nil, err
	}

	// Return a copy of all env vars
	env := make(map[string]string, len(p.EnvVars))
	for k, v := range p.EnvVars {
		env[k] = v
	}

	return env, nil
}

func errDuplicateProfileID(id string) error {
	return &duplicateProfileIDError{id: id}
}

type duplicateProfileIDError struct {
	id string
}

func (e *duplicateProfileIDError) Error() string {
	return "duplicate profile id " + `"` + e.id + `"`
}

func errForProfile(name string, err error) error {
	label := strings.TrimSpace(name)
	if label == "" {
		label = "<unnamed profile>"
	}
	return &profileImportError{name: label, err: err}
}

type profileImportError struct {
	name string
	err  error
}

func (e *profileImportError) Error() string {
	return "profile " + `"` + e.name + `"` + ": " + e.err.Error()
}
