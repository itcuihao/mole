package scriptcfg

import (
	"fmt"
	"regexp"
	"strings"
)

var configIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func validateID(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("script config id is required")
	}
	if !configIDPattern.MatchString(id) {
		return fmt.Errorf("script config id must contain only letters, digits, underscores, and dashes")
	}
	return nil
}

func validateName(name string) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("script config name is required")
	}
	return nil
}

func validateCommand(command string) error {
	if strings.TrimSpace(command) == "" {
		return fmt.Errorf("script command is required")
	}
	return nil
}

func normalizeAndValidatePlatform(platform string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(platform))
	if normalized == "" {
		return "", nil
	}
	switch normalized {
	case "macos", "windows":
		return normalized, nil
	default:
		return "", fmt.Errorf("script platform must be one of: macos, windows")
	}
}
