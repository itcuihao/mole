package docker

import (
	"fmt"
	"regexp"
	"strings"
)

var configIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
var imagePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._/-]*(:[a-zA-Z0-9._-]+)?$`)

func validateID(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("docker config id is required")
	}
	if !configIDPattern.MatchString(id) {
		return fmt.Errorf("docker config id must contain only letters, digits, underscores, and dashes")
	}
	return nil
}

func validateName(name string) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("docker config name is required")
	}
	return nil
}

func validateImage(image string) error {
	if strings.TrimSpace(image) == "" {
		return fmt.Errorf("docker image is required")
	}
	if !imagePattern.MatchString(strings.TrimSpace(image)) {
		return fmt.Errorf("invalid docker image name %q", image)
	}
	return nil
}
