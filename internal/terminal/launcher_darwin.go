//go:build darwin

package terminal

import (
	"fmt"
	"log"
	"os/exec"
	"strings"
)

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
	script := fmt.Sprintf(`
		set windowName to "%s"
		set commandText to "%s"
		set targetWindow to missing value
		tell application "iTerm"
			activate
			repeat with w in windows
				if name of w is windowName then
					set targetWindow to w
					exit repeat
				end if
			end repeat
			if targetWindow is missing value then
				set targetWindow to (create window with default profile)
				set name of targetWindow to windowName
			end if
			tell targetWindow
				create tab with default profile
				tell current session of current tab
					write text commandText
				end tell
			end tell
		end tell
	`, escapeAppleScript(windowName), escapeAppleScript(spec.CommandText))

	output, err := runOsaScript([]string{script})
	if err != nil {
		log.Printf("❌ iTerm2 error: %v | Output: %s", err, string(output))
		return fmt.Errorf("iTerm2 failed: %s: %w", string(output), err)
	}
	return nil
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
