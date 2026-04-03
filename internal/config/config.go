package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

const (
	AppName         = "mole"
	KeychainService = "mole"
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
