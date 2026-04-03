package session

import (
	"encoding/json"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Store handles Session persistence to a JSON file.
type Store struct {
	path string
	mu   sync.RWMutex
}

// NewStore creates a new session Store.
func NewStore(path string) *Store {
	return &Store{path: path}
}

func (s *Store) load() ([]Session, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return []Session{}, nil
		}
		return nil, err
	}
	if len(data) == 0 {
		return []Session{}, nil
	}
	var sessions []Session
	if err := json.Unmarshal(data, &sessions); err != nil {
		return nil, err
	}
	return sessions, nil
}

func (s *Store) save(sessions []Session) error {
	data, err := json.MarshalIndent(sessions, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

// List returns all sessions.
func (s *Store) List() ([]Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.load()
}

// Get returns a session by ID.
func (s *Store) Get(id string) (Session, error) {
	sessions, err := s.List()
	if err != nil {
		return Session{}, err
	}
	for _, sess := range sessions {
		if sess.ID == id {
			return sess, nil
		}
	}
	return Session{}, os.ErrNotExist
}

// Save adds a new session.
func (s *Store) Save(sess Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	sessions, err := s.load()
	if err != nil {
		return err
	}

	if sess.ID == "" {
		sess.ID = uuid.New().String()
		sess.CreatedAt = time.Now()
	}

	sessions = append(sessions, sess)
	return s.save(sessions)
}

// Update modifies an existing session.
func (s *Store) Update(sess Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	sessions, err := s.load()
	if err != nil {
		return err
	}

	found := false
	for i, existing := range sessions {
		if existing.ID == sess.ID {
			sess.CreatedAt = existing.CreatedAt // preserve creation time
			sessions[i] = sess
			found = true
			break
		}
	}

	if !found {
		return os.ErrNotExist
	}

	return s.save(sessions)
}

// Delete removes a session by ID.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	sessions, err := s.load()
	if err != nil {
		return err
	}

	filtered := sessions[:0]
	for _, sess := range sessions {
		if sess.ID != id {
			filtered = append(filtered, sess)
		}
	}
	return s.save(filtered)
}

// DeleteByTmuxName removes a session by its tmux session name.
func (s *Store) DeleteByTmuxName(tmuxName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	sessions, err := s.load()
	if err != nil {
		return err
	}

	filtered := sessions[:0]
	for _, sess := range sessions {
		if sess.TmuxSessionName != tmuxName {
			filtered = append(filtered, sess)
		}
	}
	return s.save(filtered)
}
