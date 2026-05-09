package codex

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"mole/internal/config"
)

// Manager coordinates Codex config metadata and isolated home files.
type Manager struct {
	store *Store
	root  string
}

func NewManager(storePath string) *Manager {
	return NewManagerWithRoot(storePath, config.CodexHomeRoot())
}

func NewManagerWithRoot(storePath, homeRoot string) *Manager {
	return &Manager{
		store: NewStore(storePath),
		root:  homeRoot,
	}
}

func (m *Manager) List() ([]Config, error) {
	configs, err := m.store.List()
	if err != nil {
		return []Config{}, err
	}

	for i := range configs {
		configs[i] = m.hydrate(configs[i])
	}

	sort.SliceStable(configs, func(i, j int) bool {
		return strings.ToLower(configs[i].Name) < strings.ToLower(configs[j].Name)
	})

	return configs, nil
}

func (m *Manager) Get(id string) (Config, error) {
	cfg, err := m.store.Get(id)
	if err != nil {
		return Config{}, err
	}
	return m.hydrate(cfg), nil
}

func (m *Manager) ReadConfigToml(id string) (string, error) {
	cfg, err := m.Get(id)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(cfg.ConfigPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}

func (m *Manager) Save(req SaveRequest) (Config, error) {
	req.ID = strings.TrimSpace(req.ID)
	req.Name = strings.TrimSpace(req.Name)

	if err := validateID(req.ID); err != nil {
		return Config{}, err
	}
	if err := validateName(req.Name); err != nil {
		return Config{}, err
	}
	if err := validateTOML(req.ConfigToml); err != nil {
		return Config{}, err
	}
	if err := validateAuthJSON(req.AuthJSON); err != nil {
		return Config{}, err
	}

	now := time.Now().Format(time.RFC3339Nano)
	existing, existingErr := m.store.Get(req.ID)
	if existingErr == nil && strings.TrimSpace(existing.CreatedAt) != "" {
		nowCreated := existing.CreatedAt
		existing = m.hydrate(existing)
		existing.Name = req.Name
		existing.CreatedAt = nowCreated
		existing.UpdatedAt = now
		if err := m.writeFiles(existing, req.ConfigToml, req.AuthJSON, req.ReplaceAuth); err != nil {
			return Config{}, err
		}
		if err := m.store.Save(existing); err != nil {
			return Config{}, err
		}
		return m.hydrate(existing), nil
	}

	cfg := m.hydrate(Config{
		ID:        req.ID,
		Name:      req.Name,
		CreatedAt: now,
		UpdatedAt: now,
	})
	if err := m.writeFiles(cfg, req.ConfigToml, req.AuthJSON, req.ReplaceAuth); err != nil {
		return Config{}, err
	}
	if err := m.store.Save(cfg); err != nil {
		return Config{}, err
	}
	return m.hydrate(cfg), nil
}

func (m *Manager) Delete(id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	return m.store.Delete(id)
}

func (m *Manager) EnsureHome(id string) (Config, error) {
	cfg, err := m.Get(id)
	if err != nil {
		return Config{}, err
	}
	if err := os.MkdirAll(cfg.HomeDir, 0700); err != nil {
		return Config{}, fmt.Errorf("failed to create Codex home: %w", err)
	}
	if _, err := os.Stat(cfg.ConfigPath); err != nil {
		if os.IsNotExist(err) {
			return Config{}, fmt.Errorf("Codex config.toml is missing for %q", cfg.Name)
		}
		return Config{}, err
	}
	return m.hydrate(cfg), nil
}

func (m *Manager) hydrate(cfg Config) Config {
	cfg.ID = strings.TrimSpace(cfg.ID)
	if cfg.Name == "" {
		cfg.Name = cfg.ID
	}

	root := m.root
	if root == "" {
		root = config.CodexHomeRoot()
	}
	home := filepath.Join(root, cfg.ID)
	cfg.HomeDir = home
	cfg.ConfigPath = filepath.Join(home, "config.toml")
	cfg.AuthPath = filepath.Join(home, "auth.json")
	if _, err := os.Stat(cfg.AuthPath); err == nil {
		cfg.AuthExists = true
	} else {
		cfg.AuthExists = false
	}

	return cfg
}

func (m *Manager) writeFiles(cfg Config, configToml, authJSON string, replaceAuth bool) error {
	if err := os.MkdirAll(cfg.HomeDir, 0700); err != nil {
		return fmt.Errorf("failed to create Codex home: %w", err)
	}
	if err := os.WriteFile(cfg.ConfigPath, []byte(configToml), 0600); err != nil {
		return fmt.Errorf("failed to write config.toml: %w", err)
	}

	if strings.TrimSpace(authJSON) == "" {
		return nil
	}

	if _, err := os.Stat(cfg.AuthPath); err == nil && !replaceAuth {
		return fmt.Errorf("auth.json already exists for %q; replace_auth is required", cfg.Name)
	}
	if err := os.WriteFile(cfg.AuthPath, []byte(authJSON), 0600); err != nil {
		return fmt.Errorf("failed to write auth.json: %w", err)
	}

	return nil
}
