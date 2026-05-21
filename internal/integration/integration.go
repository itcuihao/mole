package integration

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// Embedded template scripts — guaranteed to be available at runtime.
var (
	//go:embed template-compact.sh
	templateCompact []byte
	//go:embed template-detailed.sh
	templateDetailed []byte
	//go:embed template-minimal.sh
	templateMinimal []byte
)

var embeddedTemplates = map[string][]byte{
	"compact":  templateCompact,
	"detailed": templateDetailed,
	"minimal":  templateMinimal,
}

// Integration represents an external tool that Mole can install and configure.
type Integration struct {
	ID                 string   // "swiftbar", "xbar"
	Name               string   // "SwiftBar", "xbar"
	Description        string   // Human-readable description
	PluginDir          string   // Plugin install directory (may contain ~)
	InstallCmd         string   // Homebrew cask name, e.g. "swiftbar"
	DetectPaths        []string // App paths to check for installation
	Templates          []string // Available template names: "compact", "detailed", "minimal"
	DefaultTemplate    string   // Default template name
	DefaultInterval    int      // Default refresh interval in seconds
	AvailableIntervals []int    // Available refresh intervals: 10, 20, 30, 60
}

// IntegrationStatus is the JSON-serializable status returned to the frontend.
type IntegrationStatus struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Supported          bool     `json:"supported"`
	Installed          bool     `json:"installed"`
	PluginReady        bool     `json:"plugin_ready"`
	BrewAvailable      bool     `json:"brew_available"`
	PluginDir          string   `json:"plugin_dir"`
	Template           string   `json:"template"`
	Interval           int      `json:"interval"`
	AvailableTemplates []string `json:"available_templates"`
	AvailableIntervals []int    `json:"available_intervals"`
}

// Manager manages external tool integrations.
type Manager struct {
	integrations []Integration
	configDir    string // ~/.config/mole/
}

// scriptName computes the xbar/SwiftBar filename from interval.
// Format: mole.{interval}s.sh (e.g. mole.30s.sh)
func scriptName(interval int) string {
	return fmt.Sprintf("mole.%ds.sh", interval)
}

// NewManager creates a Manager with builtin integrations.
func NewManager(configDir string) *Manager {
	home, _ := os.UserHomeDir()

	templates := []string{"compact", "detailed", "minimal"}
	intervals := []int{10, 20, 30, 60}

	integrations := []Integration{
		{
			ID:                 "swiftbar",
			Name:               "SwiftBar",
			Description:        "Menu bar tool for macOS (xbar successor, actively maintained)",
			PluginDir:          filepath.Join(home, "Library", "Application Support", "SwiftBar", "plugins"),
			InstallCmd:         "swiftbar",
			DetectPaths:        []string{"/Applications/SwiftBar.app"},
			Templates:          templates,
			DefaultTemplate:    "compact",
			DefaultInterval:    30,
			AvailableIntervals: intervals,
		},
		{
			ID:                 "xbar",
			Name:               "xbar",
			Description:        "Menu bar plugin runner for macOS (BitBar successor)",
			PluginDir:          filepath.Join(home, "Library", "Application Support", "xbar", "plugins"),
			InstallCmd:         "xbar",
			DetectPaths:        []string{"/Applications/xbar.app"},
			Templates:          templates,
			DefaultTemplate:    "compact",
			DefaultInterval:    30,
			AvailableIntervals: intervals,
		},
	}

	return &Manager{
		integrations: integrations,
		configDir:    configDir,
	}
}

// ListStatuses returns the current status of all registered integrations.
func (m *Manager) ListStatuses() []IntegrationStatus {
	brewAvailable := detectBrew()
	supported := Supported()
	statuses := make([]IntegrationStatus, 0, len(m.integrations))

	for _, integ := range m.integrations {
		installed := supported && detectApp(integ.DetectPaths)
		template, interval := m.detectDeployedConfig(integ)
		pluginReady := template != ""
		statuses = append(statuses, IntegrationStatus{
			ID:                 integ.ID,
			Name:               integ.Name,
			Supported:          supported,
			Installed:          installed,
			PluginReady:        pluginReady,
			BrewAvailable:      brewAvailable,
			PluginDir:          integ.PluginDir,
			Template:           template,
			Interval:           interval,
			AvailableTemplates: integ.Templates,
			AvailableIntervals: integ.AvailableIntervals,
		})
	}

	return statuses
}

// InstallTool installs an external tool via Homebrew (or opens download page as fallback),
// then auto-deploys the plugin with default template and interval.
func (m *Manager) InstallTool(id string) error {
	integ, err := m.findIntegration(id)
	if err != nil {
		return err
	}

	if err := installToolApp(integ); err != nil {
		return err
	}

	// Auto-deploy after successful install.
	return m.DeployPluginWithOptions(id, integ.DefaultTemplate, strconv.Itoa(integ.DefaultInterval))
}

// DeployPluginWithOptions deploys the plugin with the specified template and interval.
// Uses atomic swap: writes new script first, then removes old ones — avoids icon gap.
func (m *Manager) DeployPluginWithOptions(id, template, interval string) error {
	integ, err := m.findIntegration(id)
	if err != nil {
		return err
	}

	templateFile := template
	scriptContent, err := m.readSourceFile(templateFile)
	if err != nil {
		return fmt.Errorf("failed to read template %s: %w", template, err)
	}

	// Ensure the plugin directory exists.
	if err := os.MkdirAll(integ.PluginDir, 0755); err != nil {
		return fmt.Errorf("failed to create plugin directory: %w", err)
	}

	// Ensure mole CLI is accessible on PATH so the plugin script can invoke it.
	if err := ensureMoleOnPath(); err != nil {
		// Non-fatal: the plugin script falls back to verbose error messages.
		fmt.Fprintf(os.Stderr, "warning: failed to ensure mole on PATH: %v\n", err)
	}

	// Compute the target filename from interval.
	intervalInt, err := strconv.Atoi(interval)
	if err != nil {
		return fmt.Errorf("invalid interval: %w", err)
	}
	destName := scriptName(intervalInt)
	destPath := filepath.Join(integ.PluginDir, destName)

	// Write new script first (atomic-ish: write content before removing old).
	if err := os.WriteFile(destPath, scriptContent, 0755); err != nil {
		return fmt.Errorf("failed to write plugin script: %w", err)
	}

	// Now remove any previously deployed mole scripts with different intervals.
	m.cleanupOldScriptsExcept(integ, intervalInt)

	return nil
}

// RemovePlugin deletes all deployed mole plugin scripts from the integration's plugin directory.
func (m *Manager) RemovePlugin(id string) error {
	integ, err := m.findIntegration(id)
	if err != nil {
		return err
	}

	m.cleanupOldScripts(integ)
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

// detectDeployedConfig scans the plugin directory for existing mole scripts
// and returns the template name and interval. Returns ("", 0) if not deployed.
func (m *Manager) detectDeployedConfig(integ Integration) (string, int) {
	for _, interval := range integ.AvailableIntervals {
		name := scriptName(interval)
		path := filepath.Join(integ.PluginDir, name)
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			continue
		}
		// Read the script to detect which template it uses.
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		template := m.detectTemplateFromContent(data)
		if template != "" {
			return template, interval
		}
		// Fallback: assume compact if we can't detect template.
		return "compact", interval
	}
	return "", 0
}

// detectTemplateFromContent reads script content and determines the template name.
func (m *Manager) detectTemplateFromContent(data []byte) string {
	content := string(data)
	if containsSubstring(content, "# Mole detailed template") {
		return "detailed"
	}
	if containsSubstring(content, "# Mole minimal template") {
		return "minimal"
	}
	if containsSubstring(content, "# Mole compact template") {
		return "compact"
	}
	return ""
}

func containsSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

// cleanupOldScripts removes all mole.*s.sh files from the plugin directory.
func (m *Manager) cleanupOldScripts(integ Integration) {
	for _, interval := range integ.AvailableIntervals {
		name := scriptName(interval)
		path := filepath.Join(integ.PluginDir, name)
		os.Remove(path) // Ignore errors, file may not exist
	}
}

// cleanupOldScriptsExcept removes mole scripts except the one with the given interval.
func (m *Manager) cleanupOldScriptsExcept(integ Integration, keepInterval int) {
	for _, interval := range integ.AvailableIntervals {
		if interval == keepInterval {
			continue
		}
		name := scriptName(interval)
		path := filepath.Join(integ.PluginDir, name)
		os.Remove(path)
	}
}

func (m *Manager) readSourceFile(templateName string) ([]byte, error) {
	if data, ok := embeddedTemplates[templateName]; ok {
		return data, nil
	}
	return nil, fmt.Errorf("unknown template: %s", templateName)
}
