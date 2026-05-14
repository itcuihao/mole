package session

import (
	"encoding/json"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type storeData struct {
	Sessions  []Session            `json:"sessions"`
	DenOrders map[string][]string  `json:"den_orders,omitempty"`
}

// Store handles Session persistence to a JSON file.
type Store struct {
	path string
	mu   sync.RWMutex
}

// NewStore creates a new session Store.
func NewStore(path string) *Store {
	return &Store{path: path}
}

func (s *Store) loadData() (storeData, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return storeData{Sessions: []Session{}, DenOrders: map[string][]string{}}, nil
		}
		return storeData{}, err
	}
	if len(data) == 0 {
		return storeData{Sessions: []Session{}, DenOrders: map[string][]string{}}, nil
	}

	var payload storeData
	if err := json.Unmarshal(data, &payload); err == nil && payload.Sessions != nil {
		normalizeStoreData(&payload)
		return payload, nil
	}

	var legacy []Session
	if err := json.Unmarshal(data, &legacy); err != nil {
		return storeData{}, err
	}

	payload = storeData{
		Sessions: legacy,
		DenOrders: map[string][]string{},
	}
	normalizeStoreData(&payload)
	return payload, nil
}

func (s *Store) load() ([]Session, error) {
	payload, err := s.loadData()
	if err != nil {
		return nil, err
	}
	return payload.Sessions, nil
}

func (s *Store) saveData(payload storeData) error {
	normalizeStoreData(&payload)
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o644)
}

func (s *Store) save(sessions []Session) error {
	payload, err := s.loadData()
	if err != nil {
		return err
	}
	payload.Sessions = sessions
	return s.saveData(payload)
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

// GetByTmuxName returns a session by its tmux session name.
func (s *Store) GetByTmuxName(tmuxName string) (Session, error) {
	sessions, err := s.List()
	if err != nil {
		return Session{}, err
	}
	for _, sess := range sessions {
		if sess.TmuxSessionName == tmuxName {
			return sess, nil
		}
	}
	return Session{}, os.ErrNotExist
}

// Save adds a new session.
func (s *Store) Save(sess Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	payload, err := s.loadData()
	if err != nil {
		return err
	}

	if sess.ID == "" {
		sess.ID = uuid.New().String()
		sess.CreatedAt = time.Now().Format(time.RFC3339Nano)
	}
	sess.NormalizeRuntimeMetadata()

	payload.Sessions = append(payload.Sessions, sess)
	return s.saveData(payload)
}

// ReplaceAll overwrites the full stored session set.
func (s *Store) ReplaceAll(sessions []Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	payload, err := s.loadData()
	if err != nil {
		return err
	}

	if sessions == nil {
		sessions = []Session{}
	}

	for i := range sessions {
		if sessions[i].ID == "" {
			sessions[i].ID = uuid.New().String()
		}
		if sessions[i].CreatedAt == "" {
			sessions[i].CreatedAt = time.Now().Format(time.RFC3339Nano)
		}
		sessions[i].NormalizeRuntimeMetadata()
	}

	payload.Sessions = sessions
	return s.saveData(payload)
}

// Update modifies an existing session.
func (s *Store) Update(sess Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	payload, err := s.loadData()
	if err != nil {
		return err
	}

	found := false
	for i, existing := range payload.Sessions {
		if existing.ID == sess.ID {
			sess.CreatedAt = existing.CreatedAt // preserve creation time
			sess.NormalizeRuntimeMetadata()
			payload.Sessions[i] = sess
			found = true
			break
		}
	}

	if !found {
		return os.ErrNotExist
	}

	return s.saveData(payload)
}

// RecordOpen increments usage counters for a session after a successful attach.
func (s *Store) RecordOpen(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	payload, err := s.loadData()
	if err != nil {
		return err
	}

	found := false
	for i, existing := range payload.Sessions {
		if existing.ID == id {
			existing.OpenCount++
			existing.LastOpenedAt = time.Now().Format(time.RFC3339Nano)
			existing.NormalizeRuntimeMetadata()
			payload.Sessions[i] = existing
			found = true
			break
		}
	}

	if !found {
		return os.ErrNotExist
	}

	return s.saveData(payload)
}

// Delete removes a session by ID.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	payload, err := s.loadData()
	if err != nil {
		return err
	}

	filtered := payload.Sessions[:0]
	for _, sess := range payload.Sessions {
		if sess.ID != id {
			filtered = append(filtered, sess)
		}
	}
	payload.Sessions = filtered
	return s.saveData(payload)
}

// DeleteByTmuxName removes a session by its tmux session name.
func (s *Store) DeleteByTmuxName(tmuxName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	payload, err := s.loadData()
	if err != nil {
		return err
	}

	filtered := payload.Sessions[:0]
	for _, sess := range payload.Sessions {
		if sess.TmuxSessionName != tmuxName {
			filtered = append(filtered, sess)
		}
	}
	payload.Sessions = filtered
	return s.saveData(payload)
}

// GetByRuntimeName returns a session by its runtime session name.
func (s *Store) GetByRuntimeName(runtimeName string) (Session, error) {
	return s.GetByTmuxName(runtimeName)
}

// DeleteByRuntimeName removes a session by its runtime session name.
func (s *Store) DeleteByRuntimeName(runtimeName string) error {
	return s.DeleteByTmuxName(runtimeName)
}

func (s *Store) GetDenOrder(den string) ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	payload, err := s.loadData()
	if err != nil {
		return nil, err
	}

	key := strings.TrimSpace(den)
	order := append([]string{}, payload.DenOrders[key]...)
	return order, nil
}

func (s *Store) SaveDenOrder(den string, sessionIDs []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	payload, err := s.loadData()
	if err != nil {
		return err
	}

	key := strings.TrimSpace(den)
	if key == "" {
		return nil
	}

	seen := map[string]struct{}{}
	filtered := make([]string, 0, len(sessionIDs))
	for _, sessionID := range sessionIDs {
		trimmed := strings.TrimSpace(sessionID)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		for _, sess := range payload.Sessions {
			if sess.ID == trimmed && strings.TrimSpace(sess.Den) == key {
				seen[trimmed] = struct{}{}
				filtered = append(filtered, trimmed)
				break
			}
		}
	}

	for _, sess := range payload.Sessions {
		if strings.TrimSpace(sess.Den) != key {
			continue
		}
		if _, ok := seen[sess.ID]; ok {
			continue
		}
		seen[sess.ID] = struct{}{}
		filtered = append(filtered, sess.ID)
	}

	if len(filtered) == 0 {
		delete(payload.DenOrders, key)
	} else {
		payload.DenOrders[key] = filtered
	}

	return s.saveData(payload)
}

func normalizeStoreData(payload *storeData) {
	if payload.Sessions == nil {
		payload.Sessions = []Session{}
	}
	if payload.DenOrders == nil {
		payload.DenOrders = map[string][]string{}
	}

	sessionByID := make(map[string]Session, len(payload.Sessions))
	for i := range payload.Sessions {
		payload.Sessions[i].NormalizeRuntimeMetadata()
		sessionByID[payload.Sessions[i].ID] = payload.Sessions[i]
	}

	for den, order := range payload.DenOrders {
		key := strings.TrimSpace(den)
		if key == "" {
			delete(payload.DenOrders, den)
			continue
		}

		seen := map[string]struct{}{}
		filtered := make([]string, 0, len(order))
		for _, sessionID := range order {
			trimmed := strings.TrimSpace(sessionID)
			if trimmed == "" {
				continue
			}
			if _, ok := seen[trimmed]; ok {
				continue
			}
			sess, ok := sessionByID[trimmed]
			if !ok || strings.TrimSpace(sess.Den) != key {
				continue
			}
			seen[trimmed] = struct{}{}
			filtered = append(filtered, trimmed)
		}

		if len(filtered) == 0 {
			delete(payload.DenOrders, den)
			continue
		}
		payload.DenOrders[key] = filtered
		if key != den {
			delete(payload.DenOrders, den)
		}
	}
}
