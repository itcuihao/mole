package pluginconfig

import (
	"path/filepath"
	"testing"
)

func TestManagerSaveListDelete(t *testing.T) {
	mgr := NewManager(filepath.Join(t.TempDir(), "plugin_configs.json"))

	cfg, err := mgr.Save(SaveRequest{
		ID:       "dev-k8s",
		Name:     "Dev K8s",
		PluginID: "k8s_pod",
		Settings: map[string]string{
			" namespace ": " default ",
			" shell ":     " /bin/sh ",
		},
	})
	if err != nil {
		t.Fatalf("Save() returned error: %v", err)
	}
	if cfg.Settings["namespace"] != "default" {
		t.Fatalf("namespace = %q, want default", cfg.Settings["namespace"])
	}

	configs, err := mgr.List("k8s_pod")
	if err != nil {
		t.Fatalf("List() returned error: %v", err)
	}
	if len(configs) != 1 {
		t.Fatalf("len(configs) = %d, want 1", len(configs))
	}

	if err := mgr.Delete("dev-k8s"); err != nil {
		t.Fatalf("Delete() returned error: %v", err)
	}
	configs, err = mgr.List("k8s_pod")
	if err != nil {
		t.Fatalf("List(after delete) returned error: %v", err)
	}
	if len(configs) != 0 {
		t.Fatalf("len(configs after delete) = %d, want 0", len(configs))
	}
}

func TestManagerRejectsInvalidConfig(t *testing.T) {
	mgr := NewManager(filepath.Join(t.TempDir(), "plugin_configs.json"))

	if _, err := mgr.Save(SaveRequest{ID: "bad id", Name: "Bad", PluginID: "k8s_pod"}); err == nil {
		t.Fatal("Save() returned nil error for invalid id")
	}
	if _, err := mgr.Save(SaveRequest{ID: "ok", Name: "", PluginID: "k8s_pod"}); err == nil {
		t.Fatal("Save() returned nil error for missing name")
	}
	if _, err := mgr.Save(SaveRequest{ID: "ok", Name: "OK", PluginID: ""}); err == nil {
		t.Fatal("Save() returned nil error for missing plugin id")
	}
}
