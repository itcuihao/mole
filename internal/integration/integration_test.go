package integration

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewManager(t *testing.T) {
	tmpDir := t.TempDir()
	m := NewManager(tmpDir)

	if len(m.integrations) != 2 {
		t.Fatalf("expected 2 integrations, got %d", len(m.integrations))
	}

	if m.integrations[0].ID != "swiftbar" {
		t.Errorf("expected first integration to be swiftbar, got %s", m.integrations[0].ID)
	}

	if m.integrations[1].ID != "xbar" {
		t.Errorf("expected second integration to be xbar, got %s", m.integrations[1].ID)
	}

	if m.integrations[0].DefaultTemplate != "compact" {
		t.Errorf("expected default template compact, got %s", m.integrations[0].DefaultTemplate)
	}

	if m.integrations[0].DefaultInterval != 30 {
		t.Errorf("expected default interval 30, got %d", m.integrations[0].DefaultInterval)
	}
}

func TestFindIntegration(t *testing.T) {
	tmpDir := t.TempDir()
	m := NewManager(tmpDir)

	sb, err := m.findIntegration("swiftbar")
	if err != nil {
		t.Fatalf("expected to find swiftbar, got error: %v", err)
	}
	if sb.Name != "SwiftBar" {
		t.Errorf("expected name SwiftBar, got %s", sb.Name)
	}

	_, err = m.findIntegration("unknown")
	if err == nil {
		t.Error("expected error for unknown integration")
	}
}

func TestScriptName(t *testing.T) {
	if scriptName(30) != "mole.30s.sh" {
		t.Errorf("expected mole.30s.sh, got %s", scriptName(30))
	}
	if scriptName(60) != "mole.60s.sh" {
		t.Errorf("expected mole.60s.sh, got %s", scriptName(60))
	}
}

func TestDeployPluginWithOptions(t *testing.T) {
	tmpDir := t.TempDir()
	m := NewManager(tmpDir)

	sb, _ := m.findIntegration("swiftbar")
	pluginDir := filepath.Join(tmpDir, "fake-swiftbar-plugins")
	sb.PluginDir = pluginDir
	m.integrations[0] = sb

	err := m.DeployPluginWithOptions("swiftbar", "compact", "30")
	if err != nil {
		t.Fatalf("DeployPluginWithOptions failed: %v", err)
	}

	destPath := filepath.Join(pluginDir, "mole.30s.sh")
	data, err := os.ReadFile(destPath)
	if err != nil {
		t.Fatalf("failed to read deployed script: %v", err)
	}
	if !containsSubstring(string(data), "# Mole compact template") {
		t.Errorf("expected compact template header in deployed script, got: %s", string(data[:80]))
	}

	info, _ := os.Stat(destPath)
	if info.Mode()&0111 == 0 {
		t.Error("expected deployed script to be executable")
	}
}

func TestDeployChangesInterval(t *testing.T) {
	tmpDir := t.TempDir()
	m := NewManager(tmpDir)

	sb, _ := m.findIntegration("swiftbar")
	pluginDir := filepath.Join(tmpDir, "fake-swiftbar-plugins")
	sb.PluginDir = pluginDir
	m.integrations[0] = sb

	os.MkdirAll(pluginDir, 0755)

	m.DeployPluginWithOptions("swiftbar", "compact", "30")
	if _, err := os.Stat(filepath.Join(pluginDir, "mole.30s.sh")); err != nil {
		t.Fatalf("mole.30s.sh should exist: %v", err)
	}

	m.DeployPluginWithOptions("swiftbar", "detailed", "60")
	if _, err := os.Stat(filepath.Join(pluginDir, "mole.60s.sh")); err != nil {
		t.Fatalf("mole.60s.sh should exist: %v", err)
	}
	if _, err := os.Stat(filepath.Join(pluginDir, "mole.30s.sh")); !os.IsNotExist(err) {
		t.Error("old mole.30s.sh should have been cleaned up")
	}
}

func TestRemovePlugin(t *testing.T) {
	tmpDir := t.TempDir()
	m := NewManager(tmpDir)

	sb, _ := m.findIntegration("swiftbar")
	pluginDir := filepath.Join(tmpDir, "fake-swiftbar-plugins")
	os.MkdirAll(pluginDir, 0755)
	sb.PluginDir = pluginDir
	m.integrations[0] = sb

	m.DeployPluginWithOptions("swiftbar", "compact", "30")
	scriptPath := filepath.Join(pluginDir, "mole.30s.sh")
	if _, err := os.Stat(scriptPath); err != nil {
		t.Fatalf("mole.30s.sh should exist after deploy: %v", err)
	}

	err := m.RemovePlugin("swiftbar")
	if err != nil {
		t.Fatalf("RemovePlugin failed: %v", err)
	}

	if _, err := os.Stat(scriptPath); !os.IsNotExist(err) {
		t.Error("expected plugin script to be removed")
	}

	err = m.RemovePlugin("swiftbar")
	if err != nil {
		t.Fatalf("RemovePlugin on nonexistent should not error: %v", err)
	}
}

func TestDetectDeployedConfig(t *testing.T) {
	tmpDir := t.TempDir()
	m := NewManager(tmpDir)

	sb, _ := m.findIntegration("swiftbar")
	pluginDir := filepath.Join(tmpDir, "fake-swiftbar-plugins")
	os.MkdirAll(pluginDir, 0755)
	sb.PluginDir = pluginDir
	m.integrations[0] = sb

	template, interval := m.detectDeployedConfig(sb)
	if template != "" || interval != 0 {
		t.Errorf("expected no deployment initially, got template=%s interval=%d", template, interval)
	}

	m.DeployPluginWithOptions("swiftbar", "detailed", "30")
	template, interval = m.detectDeployedConfig(sb)
	if template != "detailed" || interval != 30 {
		t.Errorf("expected detailed @ 30s, got template=%s interval=%d", template, interval)
	}
}

func TestDeployPluginWithOptionsUnknown(t *testing.T) {
	tmpDir := t.TempDir()
	m := NewManager(tmpDir)

	err := m.DeployPluginWithOptions("unknown", "compact", "30")
	if err == nil {
		t.Error("expected error for unknown integration")
	}
}

func TestRemovePluginUnknown(t *testing.T) {
	tmpDir := t.TempDir()
	m := NewManager(tmpDir)

	err := m.RemovePlugin("unknown")
	if err == nil {
		t.Error("expected error for unknown integration")
	}
}

func TestReadSourceFileEmbedded(t *testing.T) {
	data, err := (&Manager{}).readSourceFile("compact")
	if err != nil {
		t.Fatalf("expected to read compact template, got error: %v", err)
	}
	if len(data) == 0 {
		t.Error("expected non-empty compact template content")
	}
	if !containsSubstring(string(data), "# Mole compact template") {
		t.Error("expected compact template header")
	}

	data, err = (&Manager{}).readSourceFile("detailed")
	if err != nil {
		t.Fatalf("expected to read detailed template, got error: %v", err)
	}
	if !containsSubstring(string(data), "# Mole detailed template") {
		t.Error("expected detailed template header")
	}

	data, err = (&Manager{}).readSourceFile("minimal")
	if err != nil {
		t.Fatalf("expected to read minimal template, got error: %v", err)
	}
	if !containsSubstring(string(data), "# Mole minimal template") {
		t.Error("expected minimal template header")
	}

	_, err = (&Manager{}).readSourceFile("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent template")
	}
}