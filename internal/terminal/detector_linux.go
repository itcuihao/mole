//go:build linux

package terminal

func knownTerminals() []TerminalApp {
	return []TerminalApp{
		{ID: TerminalGhostty, Name: "Ghostty", ExecPath: "ghostty"},
		{ID: TerminalKitty, Name: "Kitty", ExecPath: "kitty"},
		{ID: TerminalAlacritty, Name: "Alacritty", ExecPath: "alacritty"},
		{ID: TerminalRio, Name: "Rio", ExecPath: "rio"},
		{ID: TerminalWezTerm, Name: "WezTerm", ExecPath: "wezterm"},
		{ID: TerminalWarp, Name: "Warp", ExecPath: "warp"},
		{ID: TerminalTilix, Name: "Tilix", ExecPath: "tilix"},
		{ID: TerminalTerminator, Name: "Terminator", ExecPath: "terminator"},
		{ID: TerminalFoot, Name: "foot", ExecPath: "foot"},
		{ID: TerminalGnome, Name: "GNOME Terminal", ExecPath: "gnome-terminal"},
		{ID: TerminalKonsole, Name: "Konsole", ExecPath: "konsole"},
		{ID: TerminalXterm, Name: "xterm", ExecPath: "xterm"},
	}
}

func preferredTerminalOrder() []string {
	return []string{TerminalGhostty, TerminalKitty, TerminalAlacritty, TerminalWezTerm, TerminalWarp, TerminalGnome, TerminalKonsole, TerminalXterm}
}

func defaultTerminalID() string {
	return TerminalXterm
}
