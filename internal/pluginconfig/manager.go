package pluginconfig

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

// Manager coordinates launch plugin presets.
type Manager struct {
	store *Store
}

func NewManager(storePath string) *Manager {
	return &Manager{store: NewStore(storePath)}
}

func (m *Manager) List(pluginID string) ([]Config, error) {
	configs, err := m.store.List()
	if err != nil {
		return []Config{}, err
	}

	pluginID = strings.TrimSpace(pluginID)
	if pluginID != "" {
		filtered := configs[:0]
		for _, cfg := range configs {
			if cfg.PluginID == pluginID {
				filtered = append(filtered, cfg)
			}
		}
		configs = filtered
	}

	sort.SliceStable(configs, func(i, j int) bool {
		return strings.ToLower(configs[i].Name) < strings.ToLower(configs[j].Name)
	})

	return configs, nil
}

func (m *Manager) Get(id string) (Config, error) {
	id = strings.TrimSpace(id)
	if err := validateID(id); err != nil {
		return Config{}, err
	}
	cfg, err := m.store.Get(id)
	if err != nil {
		return Config{}, err
	}
	if cfg.Settings == nil {
		cfg.Settings = map[string]string{}
	}
	return cfg, nil
}

func (m *Manager) Save(req SaveRequest) (Config, error) {
	req.ID = strings.TrimSpace(req.ID)
	req.Name = strings.TrimSpace(req.Name)
	req.PluginID = strings.TrimSpace(req.PluginID)
	req.Settings = trimSettings(req.Settings)

	if err := validateID(req.ID); err != nil {
		return Config{}, err
	}
	if err := validatePluginID(req.PluginID); err != nil {
		return Config{}, err
	}
	if err := validateName(req.Name); err != nil {
		return Config{}, err
	}

	now := time.Now().Format(time.RFC3339Nano)
	existing, existingErr := m.store.Get(req.ID)
	if existingErr == nil && strings.TrimSpace(existing.CreatedAt) != "" {
		existing.Name = req.Name
		existing.PluginID = req.PluginID
		existing.Settings = req.Settings
		existing.UpdatedAt = now
		if err := m.store.Save(existing); err != nil {
			return Config{}, fmt.Errorf("failed to save plugin config: %w", err)
		}
		return existing, nil
	}

	cfg := Config{
		ID:        req.ID,
		Name:      req.Name,
		PluginID:  req.PluginID,
		Settings:  req.Settings,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := m.store.Save(cfg); err != nil {
		return Config{}, fmt.Errorf("failed to save plugin config: %w", err)
	}
	return cfg, nil
}

func (m *Manager) Delete(id string) error {
	id = strings.TrimSpace(id)
	if err := validateID(id); err != nil {
		return err
	}
	return m.store.Delete(id)
}

func (m *Manager) PrepareImport(configs []Config) ([]Config, error) {
	if configs == nil {
		return []Config{}, nil
	}

	prepared := make([]Config, 0, len(configs))
	seen := make(map[string]struct{}, len(configs))
	now := time.Now().Format(time.RFC3339Nano)
	for _, cfg := range configs {
		cfg.ID = strings.TrimSpace(cfg.ID)
		cfg.Name = strings.TrimSpace(cfg.Name)
		cfg.PluginID = strings.TrimSpace(cfg.PluginID)
		cfg.Settings = trimSettings(cfg.Settings)
		if err := validateID(cfg.ID); err != nil {
			return nil, err
		}
		if err := validatePluginID(cfg.PluginID); err != nil {
			return nil, err
		}
		if err := validateName(cfg.Name); err != nil {
			return nil, err
		}
		if _, exists := seen[cfg.ID]; exists {
			return nil, fmt.Errorf("duplicate plugin config id %q", cfg.ID)
		}
		seen[cfg.ID] = struct{}{}
		if cfg.CreatedAt == "" {
			cfg.CreatedAt = now
		}
		if cfg.UpdatedAt == "" {
			cfg.UpdatedAt = now
		}
		prepared = append(prepared, cfg)
	}
	return prepared, nil
}

func (m *Manager) ReplaceAll(configs []Config) error {
	return m.store.ReplaceAll(configs)
}

func (m *Manager) Require(id, pluginID string) (Config, error) {
	cfg, err := m.Get(id)
	if err != nil {
		if os.IsNotExist(err) {
			return Config{}, fmt.Errorf("plugin config %q not found", id)
		}
		return Config{}, err
	}
	if cfg.PluginID != pluginID {
		return Config{}, fmt.Errorf("plugin config %q belongs to %q, not %q", id, cfg.PluginID, pluginID)
	}
	return cfg, nil
}

func trimSettings(settings map[string]string) map[string]string {
	next := make(map[string]string, len(settings))
	for key, value := range settings {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		next[key] = strings.TrimSpace(value)
	}
	return next
}
