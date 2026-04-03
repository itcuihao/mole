package session

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"mole/internal/config"
)

const tmuxTimeout = 5 * time.Second

// TmuxSessionInfo holds live status from tmux.
type TmuxSessionInfo struct {
	Name     string
	Attached int
	Windows  int
}

// TmuxAvailable checks if tmux is installed.
func TmuxAvailable() bool {
	_, err := exec.LookPath("tmux")
	return err == nil
}

// CreateTmuxSession creates a new detached tmux session with environment variables.
// If command is non-empty, runs that command; otherwise starts an interactive shell.
func CreateTmuxSession(name string, env map[string]string, command string) error {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	// Create a temporary env script file
	envScriptPath := filepath.Join(config.Dir(), fmt.Sprintf(".mole-env-%s.sh", name))
	var envCmds strings.Builder
	envCmds.WriteString("# Mole environment variables\n")
	for k, v := range env {
		// Escape single quotes in values
		escapedVal := strings.ReplaceAll(v, "'", "'\\''")
		envCmds.WriteString(fmt.Sprintf("export %s='%s'\n", k, escapedVal))
	}

	if err := os.WriteFile(envScriptPath, []byte(envCmds.String()), 0600); err != nil {
		return fmt.Errorf("failed to create env script: %w", err)
	}

	// Determine user's shell
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}

	// Build the command to run
	var shellCmd string
	if command != "" {
		// Run specific command with env vars, keep shell open after command exits
		shellCmd = fmt.Sprintf("source %s && %s; exec %s", envScriptPath, command, shell)
	} else {
		// Just start interactive shell with env vars
		shellCmd = fmt.Sprintf("source %s && exec %s", envScriptPath, shell)
	}

	args := []string{"new-session", "-d", "-s", name, shell, "-c", shellCmd}

	cmd := exec.CommandContext(ctx, "tmux", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		os.Remove(envScriptPath) // cleanup on failure
		return fmt.Errorf("tmux new-session failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	// Also set environment variables at tmux session level for new windows/panes
	for k, v := range env {
		setenvArgs := []string{"setenv", "-t", name, k, v}
		exec.CommandContext(ctx, "tmux", setenvArgs...).Run()
	}

	return nil
}

// ListTmuxSessions returns info about all running tmux sessions.
func ListTmuxSessions() ([]TmuxSessionInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tmux", "list-sessions", "-F", "#{session_name}:#{session_attached}:#{session_windows}")
	output, err := cmd.Output()
	if err != nil {
		// "no server running" means no sessions
		if strings.Contains(string(output), "no server") || strings.Contains(err.Error(), "exit status 1") {
			return make([]TmuxSessionInfo, 0), nil
		}
		return make([]TmuxSessionInfo, 0), err
	}

	sessions := make([]TmuxSessionInfo, 0)
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 3)
		if len(parts) != 3 {
			continue
		}
		attached, _ := strconv.Atoi(parts[1])
		windows, _ := strconv.Atoi(parts[2])
		sessions = append(sessions, TmuxSessionInfo{
			Name:     parts[0],
			Attached: attached,
			Windows:  windows,
		})
	}
	return sessions, nil
}

// KillTmuxSession terminates a tmux session.
func KillTmuxSession(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tmux", "kill-session", "-t", name)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("tmux kill-session failed: %s: %w", strings.TrimSpace(string(output)), err)
	}
	return nil
}

// IsTmuxSessionAlive checks if a tmux session exists.
func IsTmuxSessionAlive(name string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tmux", "has-session", "-t", name)
	return cmd.Run() == nil
}
