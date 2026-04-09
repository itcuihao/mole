package profile

import (
	"fmt"
	"regexp"
	"strings"
)

var envVarNamePattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// NormalizeEnvVarName trims surrounding whitespace while preserving case.
func NormalizeEnvVarName(name string) string {
	return strings.TrimSpace(name)
}

// ValidateEnvVarName checks whether name is a valid shell-style env var name.
func ValidateEnvVarName(name string) error {
	normalized := NormalizeEnvVarName(name)
	if normalized == "" {
		return fmt.Errorf("environment variable name cannot be empty")
	}
	if !envVarNamePattern.MatchString(normalized) {
		return fmt.Errorf("invalid environment variable name %q", name)
	}
	return nil
}

// ValidateProfileEnv ensures env var names are valid before persistence.
func ValidateProfileEnv(envVars map[string]string, secretKeys []string, secrets map[string]string) error {
	_, _, _, err := NormalizeProfileEnv(envVars, secretKeys, secrets)
	return err
}

// NormalizeProfileEnv trims env var names and rejects invalid or duplicate keys.
func NormalizeProfileEnv(envVars map[string]string, secretKeys []string, secrets map[string]string) (map[string]string, []string, map[string]string, error) {
	normalizedEnvVars := make(map[string]string, len(envVars))
	for key, value := range envVars {
		normalizedKey := NormalizeEnvVarName(key)
		if err := ValidateEnvVarName(normalizedKey); err != nil {
			return nil, nil, nil, err
		}
		if _, exists := normalizedEnvVars[normalizedKey]; exists {
			return nil, nil, nil, fmt.Errorf("duplicate environment variable name %q", normalizedKey)
		}
		normalizedEnvVars[normalizedKey] = value
	}

	normalizedSecretKeys := make([]string, 0, len(secretKeys))
	secretKeySet := make(map[string]struct{}, len(secretKeys))
	for _, key := range secretKeys {
		normalizedKey := NormalizeEnvVarName(key)
		if err := ValidateEnvVarName(normalizedKey); err != nil {
			return nil, nil, nil, err
		}
		if _, exists := secretKeySet[normalizedKey]; exists {
			return nil, nil, nil, fmt.Errorf("duplicate secret key %q", normalizedKey)
		}
		secretKeySet[normalizedKey] = struct{}{}
		normalizedSecretKeys = append(normalizedSecretKeys, normalizedKey)
	}

	normalizedSecrets := make(map[string]string, len(secrets))
	for key, value := range secrets {
		normalizedKey := NormalizeEnvVarName(key)
		if err := ValidateEnvVarName(normalizedKey); err != nil {
			return nil, nil, nil, err
		}
		if _, exists := normalizedSecrets[normalizedKey]; exists {
			return nil, nil, nil, fmt.Errorf("duplicate secret variable name %q", normalizedKey)
		}
		if _, exists := normalizedEnvVars[normalizedKey]; exists {
			return nil, nil, nil, fmt.Errorf("duplicate environment variable name %q", normalizedKey)
		}
		if _, exists := secretKeySet[normalizedKey]; !exists {
			return nil, nil, nil, fmt.Errorf("secret %q must be listed in secret keys", normalizedKey)
		}
		normalizedSecrets[normalizedKey] = value
	}

	return normalizedEnvVars, normalizedSecretKeys, normalizedSecrets, nil
}
