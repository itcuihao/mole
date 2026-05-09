package codex

import (
	"os"
	"path/filepath"
	"testing"
)

func TestManagerSaveWritesConfigAndAuth(t *testing.T) {
	dir := t.TempDir()
	mgr := NewManagerWithRoot(filepath.Join(dir, "codex_configs.json"), filepath.Join(dir, "homes"))

	cfg, err := mgr.Save(SaveRequest{
		ID:         "maxx",
		Name:       "Maxx",
		ConfigToml: `model_provider = "maxx"`,
		AuthJSON:   `{"OPENAI_API_KEY":"token"}`,
	})
	if err != nil {
		t.Fatalf("Save() failed: %v", err)
	}

	if !cfg.AuthExists {
		t.Fatalf("AuthExists = false, want true")
	}

	rawConfig, err := os.ReadFile(cfg.ConfigPath)
	if err != nil {
		t.Fatalf("ReadFile(config) failed: %v", err)
	}
	if string(rawConfig) != `model_provider = "maxx"` {
		t.Fatalf("config.toml = %q, want raw TOML preserved", string(rawConfig))
	}

	rawAuth, err := os.ReadFile(cfg.AuthPath)
	if err != nil {
		t.Fatalf("ReadFile(auth) failed: %v", err)
	}
	if string(rawAuth) != `{"OPENAI_API_KEY":"token"}` {
		t.Fatalf("auth.json = %q, want raw JSON preserved", string(rawAuth))
	}
}

func TestManagerSaveRequiresReplaceForExistingAuth(t *testing.T) {
	dir := t.TempDir()
	mgr := NewManagerWithRoot(filepath.Join(dir, "codex_configs.json"), filepath.Join(dir, "homes"))

	if _, err := mgr.Save(SaveRequest{
		ID:         "maxx",
		Name:       "Maxx",
		ConfigToml: `model_provider = "maxx"`,
		AuthJSON:   `{"OPENAI_API_KEY":"first"}`,
	}); err != nil {
		t.Fatalf("initial Save() failed: %v", err)
	}

	if _, err := mgr.Save(SaveRequest{
		ID:         "maxx",
		Name:       "Maxx",
		ConfigToml: `model_provider = "maxx"`,
		AuthJSON:   `{"OPENAI_API_KEY":"second"}`,
	}); err == nil {
		t.Fatalf("Save() without replace_auth succeeded, want error")
	}

	cfg, err := mgr.Save(SaveRequest{
		ID:          "maxx",
		Name:        "Maxx",
		ConfigToml:  `model_provider = "maxx"`,
		AuthJSON:    `{"OPENAI_API_KEY":"second"}`,
		ReplaceAuth: true,
	})
	if err != nil {
		t.Fatalf("Save() with replace_auth failed: %v", err)
	}

	rawAuth, err := os.ReadFile(cfg.AuthPath)
	if err != nil {
		t.Fatalf("ReadFile(auth) failed: %v", err)
	}
	if string(rawAuth) != `{"OPENAI_API_KEY":"second"}` {
		t.Fatalf("auth.json = %q, want replacement content", string(rawAuth))
	}
}
