package launcher

import (
	"fmt"
	"os/exec"
	"regexp"
)

var validSessionName = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// AttachInTerminal opens Terminal.app and attaches to a tmux session via osascript.
func AttachInTerminal(tmuxSessionName string) error {
	if !validSessionName.MatchString(tmuxSessionName) {
		return fmt.Errorf("invalid session name: %q", tmuxSessionName)
	}

	// Try iTerm2 first (better permission handling)
	script := fmt.Sprintf(`tell application "iTerm"
	activate
	create window with default profile
	tell current session of current window
		write text "tmux attach -t %s"
	end tell
end tell`, tmuxSessionName)

	cmd := exec.Command("osascript", "-e", script)
	if _, err := cmd.CombinedOutput(); err != nil {
		// Fallback to Terminal.app
		script = fmt.Sprintf(`tell application "Terminal"
		activate
		do script "tmux attach -t %s"
	end tell`, tmuxSessionName)

		cmd = exec.Command("osascript", "-e", script)
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("osascript failed: %s: %w", string(output), err)
		}
	}
	return nil
}
