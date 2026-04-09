package session

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"mole/internal/config"
	"mole/internal/terminal"
)

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

func buildTmuxAttachShellCommand(session, envScriptPath string) string {
	attachCommand := fmt.Sprintf("exec tmux attach -t %s", shellQuote(session))
	if envScriptPath == "" {
		return attachCommand
	}
	return fmt.Sprintf(". %s && %s", shellQuote(envScriptPath), attachCommand)
}

func buildTmuxAttachLaunchSpec(session string, env map[string]string) (terminal.LaunchSpec, error) {
	envScriptPath, err := writeAttachEnvScript(session, env)
	if err != nil {
		return terminal.LaunchSpec{}, err
	}

	runnerShell, runnerFlag := attachRunnerShell()
	shellCommand := buildTmuxAttachShellCommand(session, envScriptPath)
	commandText := fmt.Sprintf("%s %s %s", runnerShell, runnerFlag, shellQuote(shellCommand))

	return terminal.LaunchSpec{
		CommandText:   commandText,
		ExecArgs:      []string{runnerShell, runnerFlag, shellCommand},
		ClipboardText: commandText,
	}, nil
}

func buildInlineEnvCommands(env map[string]string) string {
	if len(env) == 0 {
		return ""
	}

	keys := make([]string, 0, len(env))
	for key := range env {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("export %s=%s", key, shellQuote(env[key])))
	}

	return strings.Join(parts, "; ")
}

func buildWslTmuxAttachShellCommand(session string, env map[string]string) string {
	parts := make([]string, 0, len(env)+1)
	if exports := buildInlineEnvCommands(env); exports != "" {
		parts = append(parts, exports)
	}
	parts = append(parts, fmt.Sprintf("exec tmux attach -t %s", shellQuote(session)))
	return strings.Join(parts, "; ")
}

func buildWslTmuxAttachLaunchSpec(session string, env map[string]string) (terminal.LaunchSpec, error) {
	shellCommand := buildWslTmuxAttachShellCommand(session, env)
	commandText := fmt.Sprintf("wsl.exe sh -lc %q", shellCommand)

	return terminal.LaunchSpec{
		CommandText:   commandText,
		ExecArgs:      []string{"wsl.exe", "sh", "-lc", shellCommand},
		ClipboardText: commandText,
	}, nil
}
