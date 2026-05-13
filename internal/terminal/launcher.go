package terminal

import (
	"errors"
	"fmt"
	"log"
	"strings"
)

var ErrCloseGroupedWindowUnsupported = errors.New("closing grouped windows is not supported for this terminal")

// Launch opens the specified terminal and runs the provided command.
func Launch(terminalID string, spec LaunchSpec) error {
	spec = normalizeLaunchSpec(spec)
	if strings.TrimSpace(spec.CommandText) == "" && len(spec.ExecArgs) == 0 {
		return fmt.Errorf("launch spec is empty")
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

	return launchOnPlatform(*terminal, spec)
}

func normalizeLaunchSpec(spec LaunchSpec) LaunchSpec {
	if strings.TrimSpace(spec.ClipboardText) == "" {
		spec.ClipboardText = spec.CommandText
	}
	return spec
}

func clipboardText(spec LaunchSpec) string {
	if strings.TrimSpace(spec.ClipboardText) != "" {
		return spec.ClipboardText
	}
	return spec.CommandText
}

// CloseGroupedWindow attempts to close the terminal window that Mole uses for a den/group.
func CloseGroupedWindow(terminalID, group string) error {
	group = strings.TrimSpace(group)
	if group == "" {
		return fmt.Errorf("group is empty")
	}

	terminal := FindByID(terminalID)
	if terminal == nil {
		return fmt.Errorf("unknown terminal: %s", terminalID)
	}
	if !terminal.IsInstalled {
		return fmt.Errorf("terminal not installed: %s", terminal.Name)
	}

	return closeGroupedWindowOnPlatform(*terminal, group)
}
