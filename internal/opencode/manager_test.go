package opencode

import (
	"path/filepath"
	"testing"
)

func TestManagerSavePersistsConfigJSON(t *testing.T) {
	dir := t.TempDir()
	mgr := NewManager(filepath.Join(dir, "opencode_configs.json"))

	cfg, err := mgr.Save(SaveRequest{
		ID:         "maxx",
		Name:       "Maxx",
		ConfigJSON: `{"provider":{"maxx":{"options":{"baseURL":"$MAXX_BASE_URL"}}}}`,
	})
	if err != nil {
		t.Fatalf("Save() failed: %v", err)
	}
	if cfg.ConfigJSON != `{"provider":{"maxx":{"options":{"baseURL":"$MAXX_BASE_URL"}}}}` {
		t.Fatalf("ConfigJSON = %q, want raw JSON preserved", cfg.ConfigJSON)
	}

	loaded, err := mgr.Get("maxx")
	if err != nil {
		t.Fatalf("Get() failed: %v", err)
	}
	if loaded.ConfigJSON != cfg.ConfigJSON {
		t.Fatalf("ConfigJSON round-trip mismatch")
	}
}

func TestManagerSavePreservesCreatedAtOnUpdate(t *testing.T) {
	dir := t.TempDir()
	mgr := NewManager(filepath.Join(dir, "opencode_configs.json"))

	first, err := mgr.Save(SaveRequest{ID: "maxx", Name: "Maxx", ConfigJSON: `{"a":1}`})
	if err != nil {
		t.Fatalf("first Save() failed: %v", err)
	}

	second, err := mgr.Save(SaveRequest{ID: "maxx", Name: "Maxx2", ConfigJSON: `{"a":2}`})
	if err != nil {
		t.Fatalf("second Save() failed: %v", err)
	}
	if second.CreatedAt != first.CreatedAt {
		t.Fatalf("CreatedAt changed on update: %q vs %q", second.CreatedAt, first.CreatedAt)
	}
	if second.Name != "Maxx2" || second.ConfigJSON != `{"a":2}` {
		t.Fatalf("update did not apply: %+v", second)
	}
}

func TestManagerSaveRejectsInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	mgr := NewManager(filepath.Join(dir, "opencode_configs.json"))

	if _, err := mgr.Save(SaveRequest{ID: "maxx", Name: "Maxx", ConfigJSON: `{not json`}); err == nil {
		t.Fatalf("Save() with invalid JSON succeeded, want error")
	}
	// non-object JSON (array) must also be rejected
	if _, err := mgr.Save(SaveRequest{ID: "maxx", Name: "Maxx", ConfigJSON: `[1,2,3]`}); err == nil {
		t.Fatalf("Save() with array JSON succeeded, want error")
	}
}
