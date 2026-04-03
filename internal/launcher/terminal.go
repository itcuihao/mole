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

	script := fmt.Sprintf(`tell application "Terminal"
	activate
	do script "tmux attach -t %s"
end tell`, tmuxSessionName)

	cmd := exec.Command("osascript", "-e", script)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("osascript failed: %s: %w", string(output), err)
	}
	return nil
}
