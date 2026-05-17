//go:build windows

package terminal

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

func launchOnPlatform(terminal TerminalApp, spec LaunchSpec) error {
	switch terminal.ID {
	case TerminalPwsh:
		return startTerminalProcess(terminal.ExecPath, "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", spec.CommandText)
	case TerminalPowerShell:
		return startTerminalProcess(terminal.ExecPath, "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", spec.CommandText)
	case TerminalCMD:
		return startTerminalProcess(terminal.ExecPath, "/k", spec.CommandText)
	default:
		return fmt.Errorf("unsupported windows terminal: %s", terminal.ID)
	}
}

func startTerminalProcess(path string, args ...string) error {
	cmd := exec.Command(path, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: 0x00000010, // CREATE_NEW_CONSOLE
	}
	// 重定向到操作系统标准设备，确保能正常弹出独立窗口
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Start()
}

func closeGroupedWindowOnPlatform(_ TerminalApp, _ string) error {
	return ErrCloseGroupedWindowUnsupported
}

func focusGroupedWindowOnPlatform(_ TerminalApp, _ string) (bool, error) {
	return false, ErrFocusGroupedWindowUnsupported
}
