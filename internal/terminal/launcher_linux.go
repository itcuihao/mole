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
	case TerminalKonsole, TerminalAlacritty, TerminalRio, TerminalXterm:
		return startTerminalProcess(terminal.ExecPath, append([]string{"-e"}, spec.ExecArgs...)...)
	case TerminalGhostty:
		args := []string{}
		if windowID := ghosttyWindowIDForDen(spec.Den); windowID != "" {
			args = append(args, "--window-id="+windowID)
		}
		args = append(args, "-e")
		args = append(args, spec.ExecArgs...)
		return startTerminalProcess(terminal.ExecPath, args...)
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

func closeGroupedWindowOnPlatform(_ TerminalApp, _ string) error {
	return ErrCloseGroupedWindowUnsupported
}

func focusGroupedWindowOnPlatform(_ TerminalApp, _ string) (bool, error) {
	return false, ErrFocusGroupedWindowUnsupported
}

func focusBurrowOnPlatform(_ TerminalApp, _ string) (bool, error) {
	return false, ErrFocusGroupedWindowUnsupported
}
