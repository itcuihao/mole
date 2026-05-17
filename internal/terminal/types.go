package terminal

// TerminalApp represents a terminal application
type TerminalApp struct {
	ID          string // Unique identifier (e.g., "terminal", "iterm2")
	Name        string // Display name (e.g., "Terminal", "iTerm2")
	BundleID    string // macOS bundle ID when applicable
	AppPath     string // Full path to .app on macOS
	ExecPath    string // Executable name or resolved path on Linux/Windows
	IsInstalled bool   // Whether the app is installed
}

// LaunchSpec describes the command a terminal should open.
type LaunchSpec struct {
	CommandText   string   // Shell-friendly form for terminals that accept text commands
	ExecArgs      []string // Direct argv form for terminals that accept exec args
	ClipboardText string   // Optional text copied for manual paste flows
	Den           string   // Optional den name for tab grouping
	Cwd           string   // Optional working directory for terminals that support it
}

// Common terminal IDs
const (
	TerminalApple      = "terminal"
	TerminalITerm2     = "iterm2"
	TerminalGhostty    = "ghostty"
	TerminalRio        = "rio"
	TerminalAlacritty  = "alacritty"
	TerminalWarp       = "warp"
	TerminalKitty      = "kitty"
	TerminalGnome      = "gnome-terminal"
	TerminalKonsole    = "konsole"
	TerminalXterm      = "xterm"
	TerminalWezTerm    = "wezterm"
	TerminalTilix      = "tilix"
	TerminalTerminator = "terminator"
	TerminalFoot       = "foot"
	TerminalPowerShell = "powershell"
	TerminalPwsh       = "pwsh"
	TerminalCMD        = "cmd"
)
