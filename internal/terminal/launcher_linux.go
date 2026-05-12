//go:build linux

package terminal

import (
	"fmt"
	"os/exec"
)

func launchOnPlatform(terminal TerminalApp, spec LaunchSpec) error {
	switch terminal.ID {
	case TerminalGnome:
		return startTerminalProcess(terminal.ExecPath, append([]string{"--"}, spec.ExecArgs...)...)
	case TerminalKonsole, TerminalAlacritty, TerminalGhostty, TerminalRio, TerminalXterm:
		return startTerminalProcess(terminal.ExecPath, append([]string{"-e"}, spec.ExecArgs...)...)
	case TerminalKitty:
		return startTerminalProcess(terminal.ExecPath, spec.ExecArgs...)
	case TerminalWezTerm:
		return startTerminalProcess(terminal.ExecPath, append([]string{"-e"}, spec.ExecArgs...)...)
	case TerminalWarp:
		return startTerminalProcess(terminal.ExecPath, spec.ExecArgs...)
	case TerminalTilix:
		return startTerminalProcess(terminal.ExecPath, append([]string{"-e"}, spec.ExecArgs...)...)
	case TerminalTerminator:
		return startTerminalProcess(terminal.ExecPath, append([]string{"-e"}, spec.ExecArgs...)...)
	case TerminalFoot:
		return startTerminalProcess(terminal.ExecPath, spec.ExecArgs...)
	default:
		return fmt.Errorf("unsupported linux terminal: %s", terminal.ID)
	}
}

func startTerminalProcess(path string, args ...string) error {
	cmd := exec.Command(path, args...)
	return cmd.Start()
}
