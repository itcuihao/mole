package config

import (
	"os"
	"path/filepath"
)

const (
	AppName         = "mole"
	KeychainService = "mole"
)

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

// EnsureDir creates the config directory if it doesn't exist.
func EnsureDir() error {
	return os.MkdirAll(Dir(), 0755)
}
