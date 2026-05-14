package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

const (
	AppName = "mole"
)

// Settings represents application settings
type Settings struct {
	DefaultTerminal string `json:"default_terminal"` // Terminal ID (e.g., "iterm2", "ghostty")
}

// Dir returns the configuration directory path (~/.config/mole/).
func Dir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", AppName)
}

// ProfilesPath returns the path to profiles.json.
func ProfilesPath() string {
	return filepath.Join(Dir(), "profiles.json")
}

// SessionsPath returns the path to sessions.json.
func SessionsPath() string {
	return filepath.Join(Dir(), "sessions.json")
}

// SettingsPath returns the path to settings.json.
func SettingsPath() string {
	return filepath.Join(Dir(), "settings.json")
}

// HostsPath returns the path to hosts.json.
func HostsPath() string {
	return filepath.Join(Dir(), "hosts.json")
}

// CodexConfigsPath returns the path to codex_configs.json.
func CodexConfigsPath() string {
	return filepath.Join(Dir(), "codex_configs.json")
}

// CodexHomeRoot returns the directory that contains isolated Codex homes.
func CodexHomeRoot() string {
	return filepath.Join(Dir(), "ai", "codex")
}

// DockerConfigsPath returns the path to docker_configs.json.
func DockerConfigsPath() string {
	return filepath.Join(Dir(), "docker_configs.json")
}

// PluginConfigsPath returns the path to launch plugin presets.
func PluginConfigsPath() string {
	return filepath.Join(Dir(), "plugin_configs.json")
}

// EnsureDir creates the config directory if it doesn't exist.
func EnsureDir() error {
	return os.MkdirAll(Dir(), 0755)
}

// LoadSettings loads settings from settings.json
func LoadSettings() (*Settings, error) {
	path := SettingsPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// Return default settings
			return &Settings{DefaultTerminal: ""}, nil
		}
		return nil, err
	}

	var settings Settings
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, err
	}

	return &settings, nil
}

// SaveSettings saves settings to settings.json
func SaveSettings(settings *Settings) error {
	if err := EnsureDir(); err != nil {
		return err
	}

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(SettingsPath(), data, 0644)
}

// InitSettings creates settings.json with default values if it doesn't exist
func InitSettings() error {
	path := SettingsPath()

	// Check if settings file already exists
	if _, err := os.Stat(path); err == nil {
		return nil // File exists, nothing to do
	}

	// Create default settings
	defaultSettings := &Settings{
		DefaultTerminal: "", // Empty string means auto-detect
	}

	return SaveSettings(defaultSettings)
}
