package integration

import (
	"fmt"
	"os"
	"path/filepath"
)

// Integration represents an external tool that Mole can install and configure.
type Integration struct {
	ID          string   // "swiftbar", "xbar"
	Name        string   // "SwiftBar", "xbar"
	Description string   // Human-readable description
	PluginDir   string   // Plugin install directory (may contain ~)
	InstallCmd  string   // Homebrew cask name, e.g. "swiftbar"
	DetectPaths []string // App paths to check for installation
	ScriptName  string   // Plugin script filename, e.g. "mole.30s.sh"
}

// IntegrationStatus is the JSON-serializable status returned to the frontend.
type IntegrationStatus struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Installed     bool   `json:"installed"`      // Tool app is present
	PluginReady   bool   `json:"plugin_ready"`   // Mole plugin script is deployed
	BrewAvailable bool   `json:"brew_available"`  // Homebrew is on this machine
	PluginDir     string `json:"plugin_dir"`      // Where plugin scripts are stored
	ScriptName    string `json:"script_name"`     // Deployed script filename, e.g. "mole.30s.sh"
}

// Manager manages external tool integrations.
type Manager struct {
	integrations []Integration
	scriptSource string // Path to the embedded plugin script template
	configDir    string // ~/.config/mole/
}

// NewManager creates a Manager with builtin integrations.
func NewManager(configDir string) *Manager {
	home, _ := os.UserHomeDir()

	integrations := []Integration{
		{
			ID:          "swiftbar",
			Name:        "SwiftBar",
			Description: "Menu bar tool for macOS (xbar successor, actively maintained)",
			PluginDir:   filepath.Join(home, "Library", "Application Support", "SwiftBar", "plugins"),
			InstallCmd:  "swiftbar",
			DetectPaths: []string{"/Applications/SwiftBar.app"},
			ScriptName:  "mole.30s.sh",
		},
		{
			ID:          "xbar",
			Name:        "xbar",
			Description: "Menu bar plugin runner for macOS (BitBar successor)",
			PluginDir:   filepath.Join(home, "Library", "Application Support", "xbar", "plugins"),
			InstallCmd:  "xbar",
			DetectPaths: []string{"/Applications/xbar.app"},
			ScriptName:  "mole.30s.sh",
		},
	}

	// scriptSource points to the xbar plugin script bundled with Mole.
	// When running as a Wails app, the working directory is the app bundle,
	// so we fall back to a relative path from configDir as well.
	scriptSource := filepath.Join(configDir, "..", "..", "scripts", "xbar", "mole.30s.sh")

	return &Manager{
		integrations: integrations,
		scriptSource: scriptSource,
		configDir:    configDir,
	}
}

// ListStatuses returns the current status of all registered integrations.
func (m *Manager) ListStatuses() []IntegrationStatus {
	brewAvailable := detectBrew()
	statuses := make([]IntegrationStatus, 0, len(m.integrations))

	for _, integ := range m.integrations {
		installed := detectApp(integ.DetectPaths)
		pluginReady := m.isPluginDeployed(integ)
		statuses = append(statuses, IntegrationStatus{
			ID:            integ.ID,
			Name:          integ.Name,
			Installed:     installed,
			PluginReady:   pluginReady,
			BrewAvailable: brewAvailable,
			PluginDir:     integ.PluginDir,
			ScriptName:    integ.ScriptName,
		})
	}

	return statuses
}

// InstallTool installs an external tool via Homebrew (or opens download page as fallback).
func (m *Manager) InstallTool(id string) error {
	integ, err := m.findIntegration(id)
	if err != nil {
		return err
	}

	return installToolApp(integ)
}

// DeployPlugin copies the Mole plugin script to the integration's plugin directory.
func (m *Manager) DeployPlugin(id string) error {
	integ, err := m.findIntegration(id)
	if err != nil {
		return err
	}

	// Ensure the plugin directory exists.
	if err := os.MkdirAll(integ.PluginDir, 0755); err != nil {
		return fmt.Errorf("failed to create plugin directory: %w", err)
	}

	// Read the source script.
	scriptContent, err := m.readSourceScript()
	if err != nil {
		return fmt.Errorf("failed to read source script: %w", err)
	}

	// Write to the target plugin directory.
	destPath := filepath.Join(integ.PluginDir, integ.ScriptName)
	if err := os.WriteFile(destPath, scriptContent, 0755); err != nil {
		return fmt.Errorf("failed to write plugin script: %w", err)
	}

	return nil
}

// RemovePlugin deletes the deployed plugin script from the integration's plugin directory.
func (m *Manager) RemovePlugin(id string) error {
	integ, err := m.findIntegration(id)
	if err != nil {
		return err
	}

	destPath := filepath.Join(integ.PluginDir, integ.ScriptName)
	if err := os.Remove(destPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove plugin script: %w", err)
	}

	return nil
}

// OpenTool launches the external tool application.
func (m *Manager) OpenTool(id string) error {
	integ, err := m.findIntegration(id)
	if err != nil {
		return err
	}

	return openApp(integ)
}

// --- helpers ---

func (m *Manager) findIntegration(id string) (Integration, error) {
	for _, integ := range m.integrations {
		if integ.ID == id {
			return integ, nil
		}
	}
	return Integration{}, fmt.Errorf("unknown integration: %s", id)
}

func (m *Manager) isPluginDeployed(integ Integration) bool {
	path := filepath.Join(integ.PluginDir, integ.ScriptName)
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

func (m *Manager) readSourceScript() ([]byte, error) {
	// Try the configured scriptSource first.
	data, err := os.ReadFile(m.scriptSource)
	if err == nil {
		return data, nil
	}

	// Fallback: try relative to the executable's directory.
	exePath, exeErr := os.Executable()
	if exeErr == nil {
		exeDir := filepath.Dir(exePath)
		fallback := filepath.Join(exeDir, "scripts", "xbar", "mole.30s.sh")
		data, err = os.ReadFile(fallback)
		if err == nil {
			return data, nil
		}
	}

	// Fallback: try well-known config-relative path.
	home, _ := os.UserHomeDir()
	fallback2 := filepath.Join(home, ".config", "mole", "scripts", "xbar", "mole.30s.sh")
	data, err = os.ReadFile(fallback2)
	if err == nil {
		return data, nil
	}

	// Final fallback: try the project repo path (for dev mode).
	fallback3 := filepath.Join(home, "mycode", "ch", "mole", "scripts", "xbar", "mole.30s.sh")
	data, err = os.ReadFile(fallback3)
	if err == nil {
		return data, nil
	}

	return nil, fmt.Errorf("cannot find source plugin script: tried %s and fallbacks", m.scriptSource)
}