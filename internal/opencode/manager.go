package opencode

import (
	"sort"
	"strings"
	"time"
)

// Manager coordinates opencode config metadata. Unlike codex there is no
// isolated home directory: opencode.json content lives in the metadata store
// and is written to a session's cwd at launch time (see plugin_opencode.go).
type Manager struct {
	store *Store
}

func NewManager(storePath string) *Manager {
	return &Manager{store: NewStore(storePath)}
}

func (m *Manager) List() ([]Config, error) {
	configs, err := m.store.List()
	if err != nil {
		return []Config{}, err
	}
	sort.SliceStable(configs, func(i, j int) bool {
		return strings.ToLower(configs[i].Name) < strings.ToLower(configs[j].Name)
	})
	return configs, nil
}

func (m *Manager) Get(id string) (Config, error) {
	return m.store.Get(id)
}

func (m *Manager) Save(req SaveRequest) (Config, error) {
	req.ID = strings.TrimSpace(req.ID)
	req.Name = strings.TrimSpace(req.Name)
	req.ConfigJSON = strings.TrimSpace(req.ConfigJSON)

	if err := validateID(req.ID); err != nil {
		return Config{}, err
	}
	if err := validateName(req.Name); err != nil {
		return Config{}, err
	}
	if err := validateJSON(req.ConfigJSON); err != nil {
		return Config{}, err
	}

	now := time.Now().Format(time.RFC3339Nano)
	existing, existingErr := m.store.Get(req.ID)
	if existingErr == nil && strings.TrimSpace(existing.CreatedAt) != "" {
		existing.Name = req.Name
		existing.ConfigJSON = req.ConfigJSON
		existing.UpdatedAt = now
		if err := m.store.Save(existing); err != nil {
			return Config{}, err
		}
		return existing, nil
	}

	cfg := Config{
		ID:         req.ID,
		Name:       req.Name,
		ConfigJSON: req.ConfigJSON,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := m.store.Save(cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (m *Manager) Delete(id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	return m.store.Delete(id)
}
