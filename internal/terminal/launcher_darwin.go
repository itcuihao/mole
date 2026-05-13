//go:build darwin

package terminal

import (
	"fmt"
	"log"
	"os/exec"
	"strconv"
	"strings"
	"sync"
)

var (
	iTermGroupWindowMu    sync.Mutex
	iTermGroupWindowByDen = make(map[string]int)
)

func getITermGroupWindowID(group string) int {
	iTermGroupWindowMu.Lock()
	defer iTermGroupWindowMu.Unlock()
	return iTermGroupWindowByDen[group]
}

func setITermGroupWindowID(group string, windowID int) {
	if group == "" || windowID <= 0 {
		return
	}
	iTermGroupWindowMu.Lock()
	iTermGroupWindowByDen[group] = windowID
	iTermGroupWindowMu.Unlock()
}

func clearITermGroupWindowID(group string) {
	iTermGroupWindowMu.Lock()
	delete(iTermGroupWindowByDen, group)
	iTermGroupWindowMu.Unlock()
}

func launchOnPlatform(terminal TerminalApp, spec LaunchSpec) error {
	switch terminal.ID {
	case TerminalApple:
		return launchTerminalApp(spec.CommandText)
	case TerminalITerm2:
		return launchITerm2(spec)
	case TerminalGhostty:
		return launchGhostty(spec)
	case TerminalRio:
		return launchRio(spec)
	case TerminalWarp:
		return launchWarp(spec)
	case TerminalAlacritty:
		return launchOpenApp("Alacritty", append([]string{"-e"}, spec.ExecArgs...)...)
	case TerminalKitty:
		return launchOpenApp("kitty", spec.ExecArgs...)
	default:
		return launchGeneric(terminal.AppPath, spec.CommandText)
	}
}

func closeGroupedWindowOnPlatform(terminal TerminalApp, group string) error {
	switch terminal.ID {
	case TerminalITerm2:
		return closeITerm2GroupedWindow(group)
	default:
		return ErrCloseGroupedWindowUnsupported
	}
}

func runOsaScriptWithArg(scriptLines []string, arg string) ([]byte, error) {
	args := make([]string, 0, len(scriptLines)*2+1)
	for _, line := range scriptLines {
		args = append(args, "-e", line)
	}
	args = append(args, arg)

	cmd := exec.Command("osascript", args...)
	return cmd.CombinedOutput()
}

func runOsaScript(scriptLines []string) ([]byte, error) {
	args := make([]string, 0, len(scriptLines)*2)
	for _, line := range scriptLines {
		args = append(args, "-e", line)
	}

	cmd := exec.Command("osascript", args...)
	return cmd.CombinedOutput()
}

func escapeAppleScript(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return s
}

func launchTerminalApp(commandText string) error {
	log.Printf("🚀 Launching Terminal.app with command: %s", commandText)
	output, err := runOsaScriptWithArg([]string{
		`on run argv`,
		`set commandText to item 1 of argv`,
		`tell application "Terminal"`,
		`activate`,
		`do script commandText`,
		`end tell`,
		`end run`,
	}, commandText)
	if err != nil {
		log.Printf("❌ Terminal.app error: %v | Output: %s", err, string(output))
		return fmt.Errorf("Terminal.app failed: %s: %w", string(output), err)
	}
	return nil
}

func launchITerm2(spec LaunchSpec) error {
	group := strings.TrimSpace(spec.Den)
	log.Printf("🚀 Launching iTerm2 (group=%q) with command: %s", group, spec.CommandText)

	if group == "" {
		// No den — create new window (existing behavior)
		output, err := runOsaScriptWithArg([]string{
			`on run argv`,
			`set commandText to item 1 of argv`,
			`tell application "iTerm"`,
			`activate`,
			`create window with default profile`,
			`tell current session of current window`,
			`write text commandText`,
			`end tell`,
			`end tell`,
			`end run`,
		}, spec.CommandText)
		if err != nil {
			log.Printf("❌ iTerm2 error: %v | Output: %s", err, string(output))
			return fmt.Errorf("iTerm2 failed: %s: %w", string(output), err)
		}
		return nil
	}

	// Den set — find or create window, then create tab
	windowName := "Mole: " + group
	hintedWindowID := getITermGroupWindowID(group)
	script := fmt.Sprintf(`
		set windowName to "%s"
		set commandText to "%s"
		set hintedWindowID to %d
		set targetWindow to missing value
		set createdWindow to false
		tell application "iTerm"
			activate
			if hintedWindowID > 0 then
				try
					repeat with w in windows
						if id of w is hintedWindowID then
							set targetWindow to w
							exit repeat
						end if
					end repeat
				end try
			end if
			if targetWindow is missing value then
				repeat with w in windows
					try
						if name of w is windowName then
							set targetWindow to w
							exit repeat
						end if
					end try
				end repeat
			end if
			if targetWindow is missing value then
				set targetWindow to (create window with default profile)
				set createdWindow to true
				-- Some iTerm2 versions/configs reject writing window name (-10006).
				-- Title customization is best-effort and must not block attaching.
				try
					set name of targetWindow to windowName
				end try
			end if
			tell targetWindow
				if createdWindow then
					set targetSession to current session of current tab
				else
					set newTab to (create tab with default profile)
					set targetSession to current session of newTab
				end if
				tell targetSession
					write text commandText
				end tell
			end tell
			return id of targetWindow
		end tell
	`, escapeAppleScript(windowName), escapeAppleScript(spec.CommandText), hintedWindowID)

	output, err := runOsaScript([]string{script})
	if err != nil {
		log.Printf("❌ iTerm2 error: %v | Output: %s", err, string(output))
		return fmt.Errorf("iTerm2 failed: %s: %w", string(output), err)
	}
	if windowID, parseErr := strconv.Atoi(strings.TrimSpace(string(output))); parseErr == nil {
		setITermGroupWindowID(group, windowID)
	} else {
		log.Printf("⚠️ iTerm2 group window id parse failed (group=%q, output=%q): %v", group, strings.TrimSpace(string(output)), parseErr)
	}
	return nil
}

func closeITerm2GroupedWindow(group string) error {
	windowName := "Mole: " + group
	hintedWindowID := getITermGroupWindowID(group)
	script := fmt.Sprintf(`
		set windowName to "%s"
		set hintedWindowID to %d
		set targetWindow to missing value
		tell application "iTerm"
			if hintedWindowID > 0 then
				try
					repeat with w in windows
						if id of w is hintedWindowID then
							set targetWindow to w
							exit repeat
						end if
					end repeat
				end try
			end if
			if targetWindow is missing value then
				repeat with w in windows
					try
						if name of w is windowName then
							set targetWindow to w
							exit repeat
						end if
					end try
				end repeat
			end if
			if targetWindow is missing value then
				return "notfound"
			end if
			close targetWindow
			return "closed"
		end tell
	`, escapeAppleScript(windowName), hintedWindowID)

	output, err := runOsaScript([]string{script})
	if err != nil {
		return fmt.Errorf("iTerm2 close window failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	status := strings.TrimSpace(string(output))
	switch status {
	case "closed", "notfound":
		clearITermGroupWindowID(group)
		return nil
	default:
		clearITermGroupWindowID(group)
		return nil
	}
}

func launchGhostty(spec LaunchSpec) error {
	group := strings.TrimSpace(spec.Den)
	log.Printf("🚀 Launching Ghostty (group=%q) with command: %s", group, spec.CommandText)

	if group == "" {
		// No den — new instance (existing behavior)
		args := []string{"-n", "-a", "Ghostty", "--args", "-e"}
		args = append(args, spec.ExecArgs...)
		cmd := exec.Command("open", args...)
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("Ghostty failed: %s: %w", string(output), err)
		}
		return nil
	}

	// Den set — target the same window via --window-id
	windowID := "mole-" + group
	args := []string{"-a", "Ghostty", "--args", "--window-id=" + windowID, "-e"}
	args = append(args, spec.ExecArgs...)
	cmd := exec.Command("open", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Ghostty failed: %s: %w", string(output), err)
	}
	return nil
}

func launchRio(spec LaunchSpec) error {
	log.Printf("🚀 Launching Rio with command: %s", spec.CommandText)
	return launchOpenAppNewInstance("Rio", append([]string{"-e"}, spec.ExecArgs...)...)
}

func launchOpenAppNewInstance(appName string, terminalArgs ...string) error {
	args := []string{"-n", "-a", appName}
	if len(terminalArgs) > 0 {
		args = append(args, "--args")
		args = append(args, terminalArgs...)
	}
	cmd := exec.Command("open", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s failed: %s: %w", appName, string(output), err)
	}
	return nil
}

func launchOpenApp(appName string, terminalArgs ...string) error {
	args := []string{"-a", appName}
	if len(terminalArgs) > 0 {
		args = append(args, "--args")
		args = append(args, terminalArgs...)
	}
	cmd := exec.Command("open", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s failed: %s: %w", appName, string(output), err)
	}
	return nil
}

func launchWarp(spec LaunchSpec) error {
	log.Printf("🚀 Launching Warp with command: %s", spec.CommandText)

	args := append([]string{"-a", "Warp", "--args", "-e"}, spec.ExecArgs...)
	cmd := exec.Command("open", args...)
	if err := cmd.Run(); err == nil {
		log.Printf("✅ Warp launched via method 1 (-e flag)")
		return nil
	}

	cmd = exec.Command("open", "-a", "Warp", "--args", "--command", spec.CommandText)
	if err := cmd.Run(); err == nil {
		log.Printf("✅ Warp launched via method 2 (--command flag)")
		return nil
	}

	log.Printf("⚠️ Warp direct execution failed, falling back to clipboard")
	copyToClipboard(clipboardText(spec))

	cmd = exec.Command("open", "-a", "Warp")
	if output, err := cmd.CombinedOutput(); err != nil {
		log.Printf("❌ Warp error: %v | Output: %s", err, string(output))
		return fmt.Errorf("Warp failed: %s: %w", string(output), err)
	}

	log.Printf("💡 Command copied to clipboard for manual paste")
	return nil
}

func launchGeneric(appPath, commandText string) error {
	copyToClipboard(commandText)

	cmd := exec.Command("open", appPath)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("generic launch failed: %w", err)
	}
	return nil
}

func copyToClipboard(text string) {
	cmd := exec.Command("bash", "-c", fmt.Sprintf("echo -n %q | pbcopy", text))
	_ = cmd.Run()
}
