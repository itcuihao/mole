package pluginconfig

import (
	"fmt"
	"regexp"
	"strings"
)

var validConfigID = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
var validPluginID = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func validateID(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("plugin config id is required")
	}
	if !validConfigID.MatchString(id) {
		return fmt.Errorf("plugin config id must contain only letters, digits, underscores, and dashes")
	}
	return nil
}

func validatePluginID(pluginID string) error {
	if strings.TrimSpace(pluginID) == "" {
		return fmt.Errorf("plugin id is required")
	}
	if !validPluginID.MatchString(pluginID) {
		return fmt.Errorf("plugin id must contain only letters, digits, underscores, and dashes")
	}
	return nil
}

func validateName(name string) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("plugin config name is required")
	}
	return nil
}
