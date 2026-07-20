package opencode

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var configIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func validateID(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("opencode config id is required")
	}
	if !configIDPattern.MatchString(id) {
		return fmt.Errorf("opencode config id must contain only letters, digits, underscores, and dashes")
	}
	return nil
}

func validateName(name string) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("opencode config name is required")
	}
	return nil
}

// validateJSON ensures config_json is either empty or a valid JSON object.
// opencode.json must be an object ({}); arrays or scalars are rejected early
// so the user gets feedback in the UI instead of an opencode parse error.
func validateJSON(raw string) error {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return fmt.Errorf("invalid opencode.json: %w", err)
	}
	return nil
}
