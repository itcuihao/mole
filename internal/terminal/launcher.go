package terminal

import (
	"fmt"
	"log"
	"os/exec"
	"regexp"
)

var validSessionName = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// AttachSession opens the specified terminal and attaches to a tmux session
func AttachSession(terminalID, tmuxSessionName string) error {
	log.Printf("📞 AttachSession called: terminal=%s, session=%s", terminalID, tmuxSessionName)

	if !validSessionName.MatchString(tmuxSessionName) {
		return fmt.Errorf("invalid session name: %q", tmuxSessionName)
	}

	terminal := FindByID(terminalID)
	if terminal == nil {
		log.Printf("❌ Unknown terminal: %s", terminalID)
		return fmt.Errorf("unknown terminal: %s", terminalID)
	}

	if !terminal.IsInstalled {
		log.Printf("❌ Terminal not installed: %s", terminal.Name)
		return fmt.Errorf("terminal not installed: %s", terminal.Name)
	}

	log.Printf("✓ Using terminal: %s (%s)", terminal.Name, terminal.ID)

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
	// Determine the right command based on whether we're in tmux
	attachCmd := getSimpleTmuxCommand(session)
	script := fmt.Sprintf(`tell application "Terminal"
	activate
	do script "%s"
end tell`, attachCmd)

	log.Printf("🚀 Launching Terminal.app with command: %s", attachCmd)
	cmd := exec.Command("osascript", "-e", script)
	if output, err := cmd.CombinedOutput(); err != nil {
		log.Printf("❌ Terminal.app error: %v | Output: %s", err, string(output))
		return fmt.Errorf("Terminal.app failed: %s: %w", string(output), err)
	}
	return nil
}

// launchITerm2 launches iTerm2
func launchITerm2(session string) error {
	// Determine the right command based on whether we're in tmux
	attachCmd := getSimpleTmuxCommand(session)
	script := fmt.Sprintf(`tell application "iTerm"
	activate
	create window with default profile
	tell current session of current window
		write text "%s"
	end tell
end tell`, attachCmd)

	log.Printf("🚀 Launching iTerm2 with command: %s", attachCmd)
	cmd := exec.Command("osascript", "-e", script)
	if output, err := cmd.CombinedOutput(); err != nil {
		log.Printf("❌ iTerm2 error: %v | Output: %s", err, string(output))
		return fmt.Errorf("iTerm2 failed: %s: %w", string(output), err)
	}
	return nil
}

// launchGhostty launches Ghostty
func launchGhostty(session string) error {
	// Split command into separate arguments for proper parsing
	cmd := exec.Command("open", "-a", "Ghostty", "--args", "-e", "tmux", "attach", "-t", session)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Ghostty failed: %s: %w", string(output), err)
	}
	return nil
}

// launchRio launches Rio terminal
func launchRio(session string) error {
	// Split command into separate arguments for proper parsing
	cmd := exec.Command("open", "-a", "Rio", "--args", "-e", "tmux", "attach", "-t", session)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Rio failed: %s: %w", string(output), err)
	}
	return nil
}

// launchWarp launches Warp with pre-filled command
func launchWarp(session string) error {
	// For new window launches, use simple attach
	simpleCmd := getSimpleTmuxCommand(session)
	// For clipboard (manual paste), use smart command
	smartCmd := tmuxAttachCommand(session)

	log.Printf("🚀 Launching Warp for session: %s", session)

	// Method 1: Try using -e flag with simple command
	cmd := exec.Command("open", "-a", "Warp", "--args", "-e", simpleCmd)
	if err := cmd.Run(); err == nil {
		log.Printf("✅ Warp launched via method 1 (-e flag)")
		return nil
	}

	// Method 2: Try using --command flag
	cmd = exec.Command("open", "-a", "Warp", "--args", "--command", simpleCmd)
	if err := cmd.Run(); err == nil {
		log.Printf("✅ Warp launched via method 2 (--command flag)")
		return nil
	}

	// Method 3: Open Warp and copy command to clipboard (manual paste)
	log.Printf("⚠️  Warp methods 1-2 failed, using clipboard (manual paste)")
	copyToClipboard(smartCmd)

	cmd = exec.Command("open", "-a", "Warp")
	if output, err := cmd.CombinedOutput(); err != nil {
		log.Printf("❌ Warp error: %v | Output: %s", err, string(output))
		return fmt.Errorf("Warp failed: %s: %w", string(output), err)
	}

	log.Printf("💡 Smart command copied to clipboard (user can paste manually)")

	return nil
}

// launchAlacritty launches Alacritty
func launchAlacritty(session string) error {
	// Use simple attach since it's a new window
	cmd := exec.Command("open", "-a", "Alacritty", "--args", "-e", "tmux", "attach", "-t", session)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Alacritty failed: %s: %w", string(output), err)
	}
	return nil
}

// launchKitty launches Kitty
func launchKitty(session string) error {
	// Use simple attach since it's a new window
	cmd := exec.Command("open", "-a", "kitty", "--args", "tmux", "attach", "-t", session)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Kitty failed: %s: %w", string(output), err)
	}
	return nil
}

// launchGeneric launches any terminal using generic open command
func launchGeneric(appPath, session string) error {
	// Copy smart attach command to clipboard for manual paste
	attachCmd := tmuxAttachCommand(session)
	copyToClipboard(attachCmd)

	cmd := exec.Command("open", appPath)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("generic launch failed: %w", err)
	}
	return nil
}

// copyToClipboard copies text to macOS clipboard (best effort, ignores errors)
func copyToClipboard(text string) {
	cmd := exec.Command("bash", "-c", fmt.Sprintf("echo -n %q | pbcopy", text))
	_ = cmd.Run()
}

// getSimpleTmuxCommand returns a simple tmux attach command for new terminal windows
// Since we're launching a NEW terminal window via AppleScript or -e flag,
// it won't be inside an existing tmux session, so we can use simple attach.
// This avoids shell quoting issues with AppleScript.
func getSimpleTmuxCommand(session string) string {
	return fmt.Sprintf("tmux attach -t %s", session)
}

// tmuxAttachCommand returns a smart tmux command that handles both cases:
// - If already inside tmux ($TMUX set): uses switch-client to avoid nesting
// - If not in tmux: uses attach
// Used for clipboard/manual paste scenarios where user might be in existing shell.
func tmuxAttachCommand(session string) string {
	return fmt.Sprintf("if [ -n \"$TMUX\" ]; then tmux switch-client -t %s; else tmux attach -t %s; fi", session, session)
}
