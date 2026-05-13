//go:build windows

package terminal

import (
	"fmt"
	"os/exec"
)

func launchOnPlatform(terminal TerminalApp, spec LaunchSpec) error {
	switch terminal.ID {
	case TerminalPowerShell:
		return startTerminalProcess(terminal.ExecPath, "-NoExit", "-Command", spec.CommandText)
	case TerminalCMD:
		return startTerminalProcess(terminal.ExecPath, "/k", spec.CommandText)
	default:
		return fmt.Errorf("unsupported windows terminal: %s", terminal.ID)
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
