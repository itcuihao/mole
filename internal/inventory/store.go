package inventory

import (
	"encoding/json"
	"os"
	"sync"
)

// Store handles inventory persistence to a JSON file.
type Store struct {
	path string
	mu   sync.RWMutex
}

// NewStore creates a new Store for the given file path.
func NewStore(path string) *Store {
	return &Store{path: path}
}

func (s *Store) load() (Inventory, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return DefaultInventory(), nil
		}
		return Inventory{}, err
	}
	if len(data) == 0 {
		return DefaultInventory(), nil
	}
	var inv Inventory
	if err := json.Unmarshal(data, &inv); err != nil {
		return Inventory{}, err
	}
	return inv, nil
}

func (s *Store) save(inv Inventory) error {
	data, err := json.MarshalIndent(inv, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

// Load returns the current inventory.
func (s *Store) Load() (Inventory, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.load()
}

// Save persists the inventory.
func (s *Store) Save(inv Inventory) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.save(inv)
}

// Update loads, mutates, and saves the inventory atomically.
func (s *Store) Update(fn func(*Inventory) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	inv, err := s.load()
	if err != nil {
		return err
	}

	if err := fn(&inv); err != nil {
		return err
	}

	return s.save(inv)
}
