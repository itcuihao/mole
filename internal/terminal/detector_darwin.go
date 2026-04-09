//go:build darwin

package terminal

func knownTerminals() []TerminalApp {
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

func preferredTerminalOrder() []string {
	return []string{TerminalITerm2, TerminalGhostty, TerminalWarp, TerminalApple}
}

func defaultTerminalID() string {
	return TerminalApple
}
