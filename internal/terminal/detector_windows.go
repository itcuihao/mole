//go:build windows

package terminal

func knownTerminals() []TerminalApp {
	return []TerminalApp{
		{ID: TerminalPowerShell, Name: "PowerShell", ExecPath: "powershell.exe"},
		{ID: TerminalCMD, Name: "Command Prompt", ExecPath: "cmd.exe"},
	}
}

func preferredTerminalOrder() []string {
	return []string{TerminalPowerShell, TerminalCMD}
}

func defaultTerminalID() string {
	return TerminalPowerShell
}
