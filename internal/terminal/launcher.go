package terminal

import (
	"fmt"
	"os/exec"
	"regexp"
)

var validSessionName = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// AttachSession opens the specified terminal and attaches to a tmux session
func AttachSession(terminalID, tmuxSessionName string) error {
	if !validSessionName.MatchString(tmuxSessionName) {
		return fmt.Errorf("invalid session name: %q", tmuxSessionName)
	}

	terminal := FindByID(terminalID)
	if terminal == nil {
		return fmt.Errorf("unknown terminal: %s", terminalID)
	}

	if !terminal.IsInstalled {
		return fmt.Errorf("terminal not installed: %s", terminal.Name)
	}

	switch terminal.ID {
	case TerminalApple:
		return launchTerminalApp(tmuxSessionName)
	case TerminalITerm2:
		return launchITerm2(tmuxSessionName)
	case TerminalGhostty:
		return launchGhostty(tmuxSessionName)
	case TerminalRio:
		return launchRio(tmuxSessionName)
	case TerminalWarp:
		return launchWarp(tmuxSessionName)
	case TerminalAlacritty:
		return launchAlacritty(tmuxSessionName)
	case TerminalKitty:
		return launchKitty(tmuxSessionName)
	default:
		return launchGeneric(terminal.AppPath, tmuxSessionName)
	}
}

// launchTerminalApp launches macOS Terminal.app
func launchTerminalApp(session string) error {
	script := fmt.Sprintf(`tell application "Terminal"
	activate
	do script "tmux attach -t %s"
end tell`, session)

	cmd := exec.Command("osascript", "-e", script)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Terminal.app failed: %s: %w", string(output), err)
	}
	return nil
}

// launchITerm2 launches iTerm2
func launchITerm2(session string) error {
	script := fmt.Sprintf(`tell application "iTerm"
	activate
	create window with default profile
	tell current session of current window
		write text "tmux attach -t %s"
	end tell
end tell`, session)

	cmd := exec.Command("osascript", "-e", script)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("iTerm2 failed: %s: %w", string(output), err)
	}
	return nil
}

// launchGhostty launches Ghostty
func launchGhostty(session string) error {
	cmd := exec.Command("open", "-a", "Ghostty", "--args", "-e", fmt.Sprintf("tmux attach -t %s", session))
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Ghostty failed: %s: %w", string(output), err)
	}
	return nil
}

// launchRio launches Rio terminal
func launchRio(session string) error {
	cmd := exec.Command("open", "-a", "Rio", "--args", "-e", fmt.Sprintf("tmux attach -t %s", session))
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Rio failed: %s: %w", string(output), err)
	}
	return nil
}

// launchWarp launches Warp
func launchWarp(session string) error {
	// Warp doesn't support direct command execution via open
	// Launch Warp and user manually attaches
	cmd := exec.Command("open", "-a", "Warp")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("Warp failed: %w", err)
	}

	// Note: User needs to manually run: tmux attach -t <session>
	// This is a limitation of Warp
	return nil
}

// launchAlacritty launches Alacritty
func launchAlacritty(session string) error {
	cmd := exec.Command("open", "-a", "Alacritty", "--args", "-e", "tmux", "attach", "-t", session)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Alacritty failed: %s: %w", string(output), err)
	}
	return nil
}

// launchKitty launches Kitty
func launchKitty(session string) error {
	cmd := exec.Command("open", "-a", "kitty", "--args", "tmux", "attach", "-t", session)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Kitty failed: %s: %w", string(output), err)
	}
	return nil
}

// launchGeneric launches any terminal using generic open command
func launchGeneric(appPath, session string) error {
	cmd := exec.Command("open", appPath)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("generic launch failed: %w", err)
	}
	return nil
}
