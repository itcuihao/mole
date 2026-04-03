package terminal

import (
	"os"
)

// KnownTerminals returns a list of all known terminal applications
func KnownTerminals() []TerminalApp {
	return []TerminalApp{
		{
			ID:       TerminalApple,
			Name:     "Terminal",
			BundleID: "com.apple.Terminal",
			AppPath:  "/System/Applications/Utilities/Terminal.app",
		},
		{
			ID:       TerminalITerm2,
			Name:     "iTerm2",
			BundleID: "com.googlecode.iterm2",
			AppPath:  "/Applications/iTerm.app",
		},
		{
			ID:       TerminalGhostty,
			Name:     "Ghostty",
			BundleID: "com.mitchellh.ghostty",
			AppPath:  "/Applications/Ghostty.app",
		},
		{
			ID:       TerminalRio,
			Name:     "Rio",
			BundleID: "com.raphamorim.rio",
			AppPath:  "/Applications/Rio.app",
		},
		{
			ID:       TerminalAlacritty,
			Name:     "Alacritty",
			BundleID: "org.alacritty",
			AppPath:  "/Applications/Alacritty.app",
		},
		{
			ID:       TerminalWarp,
			Name:     "Warp",
			BundleID: "dev.warp.Warp-Stable",
			AppPath:  "/Applications/Warp.app",
		},
		{
			ID:       TerminalKitty,
			Name:     "Kitty",
			BundleID: "net.kovidgoyal.kitty",
			AppPath:  "/Applications/kitty.app",
		},
	}
}

// DetectInstalled returns all installed terminal applications
func DetectInstalled() []TerminalApp {
	terminals := KnownTerminals()
	installed := make([]TerminalApp, 0)

	for _, term := range terminals {
		if isInstalled(term.AppPath) {
			term.IsInstalled = true
			installed = append(installed, term)
		}
	}

	return installed
}

// isInstalled checks if an application exists at the given path
func isInstalled(appPath string) bool {
	info, err := os.Stat(appPath)
	if err != nil {
		return false
	}
	return info.IsDir()
}

// FindByID returns a terminal app by its ID
func FindByID(id string) *TerminalApp {
	for _, term := range KnownTerminals() {
		if term.ID == id {
			term.IsInstalled = isInstalled(term.AppPath)
			return &term
		}
	}
	return nil
}

// GetDefaultTerminal returns the best available terminal
func GetDefaultTerminal() *TerminalApp {
	installed := DetectInstalled()
	if len(installed) == 0 {
		// Fallback to system Terminal (should always exist)
		term := FindByID(TerminalApple)
		return term
	}

	// Return first installed terminal (priority: iTerm2, Ghostty, others, Terminal)
	priority := []string{TerminalITerm2, TerminalGhostty, TerminalWarp, TerminalApple}
	for _, id := range priority {
		for _, term := range installed {
			if term.ID == id {
				return &term
			}
		}
	}

	return &installed[0]
}
