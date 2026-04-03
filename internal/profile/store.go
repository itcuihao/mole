package profile

import (
	"encoding/json"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Store handles Profile persistence to a JSON file.
type Store struct {
	path string
	mu   sync.RWMutex
}

// NewStore creates a new Store for the given file path.
func NewStore(path string) *Store {
	return &Store{path: path}
}

func (s *Store) load() ([]Profile, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return []Profile{}, nil
		}
		return nil, err
	}
	if len(data) == 0 {
		return []Profile{}, nil
	}
	var profiles []Profile
	if err := json.Unmarshal(data, &profiles); err != nil {
		return nil, err
	}
	return profiles, nil
}

func (s *Store) save(profiles []Profile) error {
	data, err := json.MarshalIndent(profiles, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

// List returns all profiles.
func (s *Store) List() ([]Profile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.load()
}

// Get returns a profile by ID.
func (s *Store) Get(id string) (Profile, error) {
	profiles, err := s.List()
	if err != nil {
		return Profile{}, err
	}
	for _, p := range profiles {
		if p.ID == id {
			return p, nil
		}
	}
	return Profile{}, os.ErrNotExist
}

// Save creates or updates a profile.
func (s *Store) Save(p Profile) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	profiles, err := s.load()
	if err != nil {
		return err
	}

	if p.ID == "" {
		p.ID = uuid.New().String()
		p.CreatedAt = time.Now()
		profiles = append(profiles, p)
	} else {
		found := false
		for i, existing := range profiles {
			if existing.ID == p.ID {
				p.CreatedAt = existing.CreatedAt
				profiles[i] = p
				found = true
				break
			}
		}
		if !found {
			p.CreatedAt = time.Now()
			profiles = append(profiles, p)
		}
	}

	return s.save(profiles)
}

// Delete removes a profile by ID.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	profiles, err := s.load()
	if err != nil {
		return err
	}

	filtered := profiles[:0]
	for _, p := range profiles {
		if p.ID != id {
			filtered = append(filtered, p)
		}
	}

	return s.save(filtered)
}
