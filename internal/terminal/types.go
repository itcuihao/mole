package terminal

// TerminalApp represents a terminal application
type TerminalApp struct {
	ID          string // Unique identifier (e.g., "terminal", "iterm2")
	Name        string // Display name (e.g., "Terminal", "iTerm2")
	BundleID    string // macOS bundle ID (e.g., "com.apple.Terminal")
	AppPath     string // Full path to .app (e.g., "/Applications/iTerm.app")
	IsInstalled bool   // Whether the app is installed
}

// Common terminal IDs
const (
	TerminalApple   = "terminal"
	TerminalITerm2  = "iterm2"
	TerminalGhostty = "ghostty"
	TerminalRio     = "rio"
	TerminalAlacritty = "alacritty"
	TerminalWarp    = "warp"
	TerminalKitty   = "kitty"
)
