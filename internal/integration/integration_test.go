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

func TestIsPluginDeployed(t *testing.T) {
	tmpDir := t.TempDir()
	m := NewManager(tmpDir)

	// Create a fake plugin directory and script.
	sb, _ := m.findIntegration("swiftbar")
	pluginDir := filepath.Join(tmpDir, "fake-swiftbar-plugins")
	os.MkdirAll(pluginDir, 0755)

	// Override PluginDir to use temp dir for testing.
	sb.PluginDir = pluginDir
	m.integrations[0] = sb

	if m.isPluginDeployed(sb) {
		t.Error("expected plugin not deployed initially")
	}

	// Write the plugin script.
	scriptPath := filepath.Join(pluginDir, sb.ScriptName)
	os.WriteFile(scriptPath, []byte("#!/bin/bash\necho test\n"), 0755)

	if !m.isPluginDeployed(sb) {
		t.Error("expected plugin to be deployed after writing script")
	}
}

func TestDeployPlugin(t *testing.T) {
	tmpDir := t.TempDir()
	m := NewManager(tmpDir)

	// Set up a fake plugin dir.
	sb, _ := m.findIntegration("swiftbar")
	pluginDir := filepath.Join(tmpDir, "fake-swiftbar-plugins")
	sb.PluginDir = pluginDir
	m.integrations[0] = sb

	// Create a fake source script.
	sourceDir := filepath.Join(tmpDir, "scripts", "xbar")
	os.MkdirAll(sourceDir, 0755)
	sourceScript := filepath.Join(sourceDir, "mole.30s.sh")
	os.WriteFile(sourceScript, []byte("#!/bin/bash\necho mole\n"), 0755)
	m.scriptSource = sourceScript

	err := m.DeployPlugin("swiftbar")
	if err != nil {
		t.Fatalf("DeployPlugin failed: %v", err)
	}

	// Verify the deployed script exists.
	destPath := filepath.Join(pluginDir, "mole.30s.sh")
	data, err := os.ReadFile(destPath)
	if err != nil {
		t.Fatalf("failed to read deployed script: %v", err)
	}
	if string(data) != "#!/bin/bash\necho mole\n" {
		t.Errorf("unexpected deployed script content: %s", string(data))
	}

	// Verify executable permission.
	info, _ := os.Stat(destPath)
	if info.Mode()&0111 == 0 {
		t.Error("expected deployed script to be executable")
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

	// Write a plugin script first.
	scriptPath := filepath.Join(pluginDir, "mole.30s.sh")
	os.WriteFile(scriptPath, []byte("#!/bin/bash\necho test\n"), 0755)

	err := m.RemovePlugin("swiftbar")
	if err != nil {
		t.Fatalf("RemovePlugin failed: %v", err)
	}

	if _, err := os.Stat(scriptPath); !os.IsNotExist(err) {
		t.Error("expected plugin script to be removed")
	}

	// Removing again should succeed (no error for nonexistent).
	err = m.RemovePlugin("swiftbar")
	if err != nil {
		t.Fatalf("RemovePlugin on nonexistent should not error: %v", err)
	}
}

func TestDeployPluginUnknown(t *testing.T) {
	tmpDir := t.TempDir()
	m := NewManager(tmpDir)

	err := m.DeployPlugin("unknown")
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