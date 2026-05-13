package docker

import (
	"encoding/json"
	"os"
	"sync"
)

// Store handles Docker configuration metadata persistence.
type Store struct {
	path string
	mu   sync.RWMutex
}

func NewStore(path string) *Store {
	return &Store{path: path}
}

func (s *Store) load() ([]Config, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return []Config{}, nil
		}
		return nil, err
	}
	if len(data) == 0 {
		return []Config{}, nil
	}

	var configs []Config
	if err := json.Unmarshal(data, &configs); err != nil {
		return nil, err
	}
	return configs, nil
}

func (s *Store) save(configs []Config) error {
	data, err := json.MarshalIndent(configs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

func (s *Store) List() ([]Config, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.load()
}

func (s *Store) Get(id string) (Config, error) {
	configs, err := s.List()
	if err != nil {
		return Config{}, err
	}
	for _, cfg := range configs {
		if cfg.ID == id {
			return cfg, nil
		}
	}
	return Config{}, os.ErrNotExist
}

func (s *Store) Save(cfg Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	configs, err := s.load()
	if err != nil {
		return err
	}

	found := false
	for i, existing := range configs {
		if existing.ID == cfg.ID {
			if cfg.CreatedAt == "" {
				cfg.CreatedAt = existing.CreatedAt
			}
			configs[i] = cfg
			found = true
			break
		}
	}
	if !found {
		configs = append(configs, cfg)
	}

	return s.save(configs)
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	configs, err := s.load()
	if err != nil {
		return err
	}

	filtered := configs[:0]
	for _, cfg := range configs {
		if cfg.ID != id {
			filtered = append(filtered, cfg)
		}
	}
	return s.save(filtered)
}
