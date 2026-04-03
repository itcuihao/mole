package profile

import "fmt"

// Manager combines Profile file store with Keychain operations.
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

// Save stores a profile. Plain env vars go to JSON, secret values go to Keychain.
// The secrets map contains key->value pairs for keys listed in profile.SecretKeys.
func (m *Manager) Save(p Profile, secrets map[string]string) error {
	// Store secret values in Keychain
	for _, key := range p.SecretKeys {
		val, ok := secrets[key]
		if !ok || val == "" {
			continue
		}
		if err := SetSecret(p.ID, key, val); err != nil {
			return fmt.Errorf("failed to store secret %q: %w", key, err)
		}
	}

	// Store profile metadata (without secret values) in JSON
	return m.store.Save(p)
}

// Delete removes a profile and all its Keychain secrets.
func (m *Manager) Delete(id string) error {
	p, err := m.store.Get(id)
	if err != nil {
		return err
	}

	// Clean up Keychain entries
	DeleteAllSecrets(id, p.SecretKeys)

	return m.store.Delete(id)
}

// GetFullEnv merges plain env vars with Keychain secrets into a single map.
func (m *Manager) GetFullEnv(profileID string) (map[string]string, error) {
	p, err := m.store.Get(profileID)
	if err != nil {
		return nil, err
	}

	env := make(map[string]string, len(p.EnvVars)+len(p.SecretKeys))

	// Copy plain env vars
	for k, v := range p.EnvVars {
		env[k] = v
	}

	// Fetch secret values from Keychain
	for _, key := range p.SecretKeys {
		val, err := GetSecret(profileID, key)
		if err != nil {
			continue // skip missing secrets
		}
		env[key] = val
	}

	return env, nil
}
