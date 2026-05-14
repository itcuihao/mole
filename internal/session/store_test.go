package session

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestStoreLoadsLegacyArrayAndWritesObjectFormat(t *testing.T) {
	storePath := filepath.Join(t.TempDir(), "sessions.json")
	legacy := []Session{
		{ID: "s1", Name: "alpha", TmuxSessionName: "mole-alpha", Den: "nest"},
	}
	raw, err := json.Marshal(legacy)
	if err != nil {
		t.Fatalf("marshal legacy sessions: %v", err)
	}
	if err := os.WriteFile(storePath, raw, 0o644); err != nil {
		t.Fatalf("write legacy store: %v", err)
	}

	store := NewStore(storePath)
	sessions, err := store.List()
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 1 || sessions[0].ID != "s1" {
		t.Fatalf("unexpected legacy sessions: %#v", sessions)
	}

	if err := store.SaveDenOrder("nest", []string{"s1"}); err != nil {
		t.Fatalf("save den order: %v", err)
	}

	saved := readStoreDataForTest(t, storePath)
	if len(saved.Sessions) != 1 || saved.Sessions[0].ID != "s1" {
		t.Fatalf("unexpected stored sessions: %#v", saved.Sessions)
	}
	if len(saved.DenOrders["nest"]) != 1 || saved.DenOrders["nest"][0] != "s1" {
		t.Fatalf("unexpected den order: %#v", saved.DenOrders)
	}
}

func TestStoreSaveDenOrderAppendsMissingAndCleansDeletedSessions(t *testing.T) {
	store := NewStore(filepath.Join(t.TempDir(), "sessions.json"))
	if err := store.Save(Session{ID: "s1", Name: "alpha", TmuxSessionName: "mole-alpha", Den: "nest"}); err != nil {
		t.Fatalf("save session 1: %v", err)
	}
	if err := store.Save(Session{ID: "s2", Name: "beta", TmuxSessionName: "mole-beta", Den: "nest"}); err != nil {
		t.Fatalf("save session 2: %v", err)
	}

	if err := store.SaveDenOrder("nest", []string{"s2"}); err != nil {
		t.Fatalf("save den order: %v", err)
	}

	order, err := store.GetDenOrder("nest")
	if err != nil {
		t.Fatalf("get den order: %v", err)
	}
	if len(order) != 2 || order[0] != "s2" || order[1] != "s1" {
		t.Fatalf("unexpected den order after append: %#v", order)
	}

	if err := store.Delete("s2"); err != nil {
		t.Fatalf("delete session 2: %v", err)
	}

	order, err = store.GetDenOrder("nest")
	if err != nil {
		t.Fatalf("get den order after delete: %v", err)
	}
	if len(order) != 1 || order[0] != "s1" {
		t.Fatalf("unexpected den order after delete: %#v", order)
	}
}

func readStoreDataForTest(t *testing.T, path string) storeData {
	t.Helper()

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read store file: %v", err)
	}
	var payload storeData
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("unmarshal store payload: %v", err)
	}
	return payload
}
