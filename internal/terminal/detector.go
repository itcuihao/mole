package terminal

import (
	"os"
	"os/exec"
)

// KnownTerminals returns a list of all known terminal applications.
func KnownTerminals() []TerminalApp {
	return knownTerminals()
}

// DetectInstalled returns all installed terminal applications.
func DetectInstalled() []TerminalApp {
	terminals := KnownTerminals()
	installed := make([]TerminalApp, 0, len(terminals))

	for _, term := range terminals {
		term = withInstallStatus(term)
		if term.IsInstalled {
			installed = append(installed, term)
		}
	}

	return installed
}

// FindByID returns a terminal app by its ID.
func FindByID(id string) *TerminalApp {
	for _, term := range KnownTerminals() {
		if term.ID == id {
			term = withInstallStatus(term)
			return &term
		}
	}
	return nil
}

// GetDefaultTerminal returns the best available terminal for the current platform.
func GetDefaultTerminal() *TerminalApp {
	installed := DetectInstalled()
	if len(installed) == 0 {
		fallback := FindByID(DefaultTerminalID())
		if fallback != nil && fallback.IsInstalled {
			return fallback
		}
		return nil
	}

	for _, id := range preferredTerminalOrder() {
		for _, term := range installed {
			if term.ID == id {
				return &term
			}
		}
	}

	return &installed[0]
}

// DefaultTerminalID returns the platform fallback terminal ID.
func DefaultTerminalID() string {
	return defaultTerminalID()
}

func withInstallStatus(term TerminalApp) TerminalApp {
	resolvedPath, installed := resolveInstallTarget(term)
	if !installed {
		return term
	}

	term.IsInstalled = true
	if term.AppPath != "" {
		term.AppPath = resolvedPath
	}
	if term.ExecPath != "" {
		term.ExecPath = resolvedPath
	}
	return term
}

func resolveInstallTarget(term TerminalApp) (string, bool) {
	if term.AppPath != "" {
		info, err := os.Stat(term.AppPath)
		if err != nil || !info.IsDir() {
			return "", false
		}
		return term.AppPath, true
	}

	if term.ExecPath != "" {
		path, err := exec.LookPath(term.ExecPath)
		if err != nil {
			return "", false
		}
		return path, true
	}

	return "", false
}
