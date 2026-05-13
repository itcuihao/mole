package docker

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// Manager coordinates Docker config metadata.
type Manager struct {
	store *Store
}

func NewManager(storePath string) *Manager {
	return &Manager{
		store: NewStore(storePath),
	}
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
	cfg, err := m.store.Get(id)
	if err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (m *Manager) Save(req SaveRequest) (Config, error) {
	req.ID = strings.TrimSpace(req.ID)
	req.Name = strings.TrimSpace(req.Name)
	req.Image = strings.TrimSpace(req.Image)

	if err := validateID(req.ID); err != nil {
		return Config{}, err
	}
	if err := validateName(req.Name); err != nil {
		return Config{}, err
	}
	if err := validateImage(req.Image); err != nil {
		return Config{}, err
	}

	now := time.Now().Format(time.RFC3339Nano)
	existing, existingErr := m.store.Get(req.ID)
	if existingErr == nil && strings.TrimSpace(existing.CreatedAt) != "" {
		existing.Name = req.Name
		existing.Image = req.Image
		existing.UpdatedAt = now
		if err := m.store.Save(existing); err != nil {
			return Config{}, fmt.Errorf("failed to save docker config: %w", err)
		}
		return existing, nil
	}

	cfg := Config{
		ID:        req.ID,
		Name:      req.Name,
		Image:     req.Image,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := m.store.Save(cfg); err != nil {
		return Config{}, fmt.Errorf("failed to save docker config: %w", err)
	}
	return cfg, nil
}

func (m *Manager) Delete(id string) error {
	if err := validateID(id); err != nil {
		return err
	}
	return m.store.Delete(id)
}

// BuildRunCommand builds the docker run command for a session.
func (m *Manager) BuildRunCommand(dockerConfigID string) (string, error) {
	cfg, err := m.Get(dockerConfigID)
	if err != nil {
		return "", fmt.Errorf("docker config %q not found: %w", dockerConfigID, err)
	}

	parts := []string{
		"docker", "run", "-it", "--rm",
		"-v", "${HOME}:/host/home",
		cfg.Image,
	}

	return strings.Join(parts, " "), nil
}
