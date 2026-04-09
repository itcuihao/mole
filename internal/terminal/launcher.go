package terminal

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"mole/internal/config"
)

var validSessionName = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

type attachLaunchSpec struct {
	commandText string
	execArgs    []string
}

// AttachSession opens the specified terminal and attaches to a tmux session
func AttachSession(terminalID, tmuxSessionName string, env map[string]string) error {
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

	launchSpec, err := buildAttachLaunchSpec(tmuxSessionName, env)
	if err != nil {
		return err
	}

	switch terminal.ID {
	case TerminalApple:
		return launchTerminalApp(launchSpec.commandText)
	case TerminalITerm2:
		return launchITerm2(launchSpec.commandText)
	case TerminalGhostty:
		return launchGhostty(launchSpec.execArgs)
	case TerminalRio:
		return launchRio(launchSpec.execArgs)
	case TerminalWarp:
		return launchWarp(tmuxSessionName, launchSpec)
	case TerminalAlacritty:
		return launchAlacritty(launchSpec.execArgs)
	case TerminalKitty:
		return launchKitty(launchSpec.execArgs)
	default:
		return launchGeneric(terminal.AppPath, launchSpec.commandText)
	}
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func attachRunnerShell() (string, string) {
	runnerShell := "/bin/zsh"
	runnerFlag := "-lc"
	if _, err := os.Stat(runnerShell); err != nil {
		runnerShell = "/bin/sh"
		runnerFlag = "-c"
	}
	return runnerShell, runnerFlag
}

func writeAttachEnvScript(session string, env map[string]string) (string, error) {
	if len(env) == 0 {
		return "", nil
	}

	if err := config.EnsureDir(); err != nil {
		return "", fmt.Errorf("failed to ensure config directory: %w", err)
	}

	scriptPath := filepath.Join(config.Dir(), fmt.Sprintf(".mole-attach-env-%s.sh", session))

	keys := make([]string, 0, len(env))
	for key := range env {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	var script strings.Builder
	script.WriteString("# Mole attach environment variables\n")
	for _, key := range keys {
		script.WriteString(fmt.Sprintf("export %s=%s\n", key, shellQuote(env[key])))
	}

	if err := os.WriteFile(scriptPath, []byte(script.String()), 0600); err != nil {
		return "", fmt.Errorf("failed to create attach env script: %w", err)
	}

	return scriptPath, nil
}

func buildAttachShellCommand(session, envScriptPath string) string {
	attachCommand := fmt.Sprintf("exec tmux attach -t %s", shellQuote(session))
	if envScriptPath == "" {
		return attachCommand
	}
	return fmt.Sprintf(". %s && %s", shellQuote(envScriptPath), attachCommand)
}

func buildAttachLaunchSpec(session string, env map[string]string) (attachLaunchSpec, error) {
	envScriptPath, err := writeAttachEnvScript(session, env)
	if err != nil {
		return attachLaunchSpec{}, err
	}

	runnerShell, runnerFlag := attachRunnerShell()
	shellCommand := buildAttachShellCommand(session, envScriptPath)

	return attachLaunchSpec{
		commandText: fmt.Sprintf("%s %s %s", runnerShell, runnerFlag, shellQuote(shellCommand)),
		execArgs:    []string{runnerShell, runnerFlag, shellCommand},
	}, nil
}

// launchTerminalApp launches macOS Terminal.app
func launchTerminalApp(commandText string) error {
	script := fmt.Sprintf(`tell application "Terminal"
	activate
	do script "%s"
end tell`, commandText)

	log.Printf("🚀 Launching Terminal.app with command: %s", commandText)
	cmd := exec.Command("osascript", "-e", script)
	if output, err := cmd.CombinedOutput(); err != nil {
		log.Printf("❌ Terminal.app error: %v | Output: %s", err, string(output))
		return fmt.Errorf("Terminal.app failed: %s: %w", string(output), err)
	}
	return nil
}

// launchITerm2 launches iTerm2
func launchITerm2(commandText string) error {
	script := fmt.Sprintf(`tell application "iTerm"
	activate
	create window with default profile
	tell current session of current window
		write text "%s"
	end tell
end tell`, commandText)

	log.Printf("🚀 Launching iTerm2 with command: %s", commandText)
	cmd := exec.Command("osascript", "-e", script)
	if output, err := cmd.CombinedOutput(); err != nil {
		log.Printf("❌ iTerm2 error: %v | Output: %s", err, string(output))
		return fmt.Errorf("iTerm2 failed: %s: %w", string(output), err)
	}
	return nil
}

// launchGhostty launches Ghostty
func launchGhostty(execArgs []string) error {
	args := append([]string{"-a", "Ghostty", "--args", "-e"}, execArgs...)
	cmd := exec.Command("open", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Ghostty failed: %s: %w", string(output), err)
	}
	return nil
}

// launchRio launches Rio terminal
func launchRio(execArgs []string) error {
	args := append([]string{"-a", "Rio", "--args", "-e"}, execArgs...)
	cmd := exec.Command("open", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Rio failed: %s: %w", string(output), err)
	}
	return nil
}

// launchWarp launches Warp with pre-filled command
func launchWarp(session string, spec attachLaunchSpec) error {
	log.Printf("🚀 Launching Warp for session: %s", session)

	args := append([]string{"-a", "Warp", "--args", "-e"}, spec.execArgs...)
	cmd := exec.Command("open", args...)
	if err := cmd.Run(); err == nil {
		log.Printf("✅ Warp launched via method 1 (-e flag)")
		return nil
	}

	// Method 2: Try using --command flag
	cmd = exec.Command("open", "-a", "Warp", "--args", "--command", spec.commandText)
	if err := cmd.Run(); err == nil {
		log.Printf("✅ Warp launched via method 2 (--command flag)")
		return nil
	}

	// Method 3: Open Warp and copy command to clipboard (manual paste)
	log.Printf("⚠️  Warp methods 1-2 failed, using clipboard (manual paste)")
	copyToClipboard(spec.commandText)

	cmd = exec.Command("open", "-a", "Warp")
	if output, err := cmd.CombinedOutput(); err != nil {
		log.Printf("❌ Warp error: %v | Output: %s", err, string(output))
		return fmt.Errorf("Warp failed: %s: %w", string(output), err)
	}

	log.Printf("💡 Smart command copied to clipboard (user can paste manually)")

	return nil
}

// launchAlacritty launches Alacritty
func launchAlacritty(execArgs []string) error {
	args := append([]string{"-a", "Alacritty", "--args", "-e"}, execArgs...)
	cmd := exec.Command("open", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Alacritty failed: %s: %w", string(output), err)
	}
	return nil
}

// launchKitty launches Kitty
func launchKitty(execArgs []string) error {
	args := append([]string{"-a", "kitty", "--args"}, execArgs...)
	cmd := exec.Command("open", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Kitty failed: %s: %w", string(output), err)
	}
	return nil
}

// launchGeneric launches any terminal using generic open command
func launchGeneric(appPath, commandText string) error {
	copyToClipboard(commandText)

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
