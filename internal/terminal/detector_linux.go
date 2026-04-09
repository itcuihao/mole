//go:build linux

package terminal

func knownTerminals() []TerminalApp {
	return []TerminalApp{
		{ID: TerminalGhostty, Name: "Ghostty", ExecPath: "ghostty"},
		{ID: TerminalKitty, Name: "Kitty", ExecPath: "kitty"},
		{ID: TerminalAlacritty, Name: "Alacritty", ExecPath: "alacritty"},
		{ID: TerminalRio, Name: "Rio", ExecPath: "rio"},
		{ID: TerminalGnome, Name: "GNOME Terminal", ExecPath: "gnome-terminal"},
		{ID: TerminalKonsole, Name: "Konsole", ExecPath: "konsole"},
		{ID: TerminalXterm, Name: "xterm", ExecPath: "xterm"},
	}
}

func preferredTerminalOrder() []string {
	return []string{TerminalGhostty, TerminalKitty, TerminalAlacritty, TerminalGnome, TerminalKonsole, TerminalXterm}
}

func defaultTerminalID() string {
	return TerminalXterm
}
