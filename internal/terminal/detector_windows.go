//go:build windows

package terminal

func knownTerminals() []TerminalApp {
	return []TerminalApp{
		{ID: TerminalPwsh, Name: "PowerShell 7 (pwsh)", ExecPath: "pwsh.exe"},
		{ID: TerminalPowerShell, Name: "PowerShell", ExecPath: "powershell.exe"},
		{ID: TerminalCMD, Name: "Command Prompt", ExecPath: "cmd.exe"},
	}
}

func preferredTerminalOrder() []string {
	return []string{TerminalPwsh, TerminalPowerShell, TerminalCMD}
}

func defaultTerminalID() string {
	return TerminalPwsh
}
