package codex

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var configIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func validateID(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("codex config id is required")
	}
	if !configIDPattern.MatchString(id) {
		return fmt.Errorf("codex config id must contain only letters, digits, underscores, and dashes")
	}
	return nil
}

func validateName(name string) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("codex config name is required")
	}
	return nil
}

func validateAuthJSON(raw string) error {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var payload any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return fmt.Errorf("invalid auth.json: %w", err)
	}
	return nil
}

// validateTOML performs conservative syntax checks without interpreting Codex
// settings. It intentionally accepts unknown keys and tables.
func validateTOML(raw string) error {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}

	inMultilineBasic := false
	inMultilineLiteral := false
	collectionDepth := 0

	for lineNo, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(stripTOMLComment(line))
		if line == "" {
			continue
		}

		if strings.Count(line, `"""`)%2 == 1 {
			inMultilineBasic = !inMultilineBasic
		}
		if strings.Count(line, `'''`)%2 == 1 {
			inMultilineLiteral = !inMultilineLiteral
		}
		if inMultilineBasic || inMultilineLiteral {
			continue
		}

		if collectionDepth > 0 {
			collectionDepth += tomlCollectionDelta(line)
			if collectionDepth < 0 {
				return fmt.Errorf("unbalanced TOML collection at line %d", lineNo+1)
			}
			continue
		}

		if strings.HasPrefix(line, "[") {
			if !strings.HasSuffix(line, "]") {
				return fmt.Errorf("invalid TOML table at line %d", lineNo+1)
			}
			name := strings.Trim(line, "[]")
			if strings.TrimSpace(name) == "" {
				return fmt.Errorf("empty TOML table at line %d", lineNo+1)
			}
			continue
		}

		if !strings.Contains(line, "=") {
			return fmt.Errorf("invalid TOML assignment at line %d", lineNo+1)
		}

		parts := strings.SplitN(line, "=", 2)
		if strings.TrimSpace(parts[0]) == "" {
			return fmt.Errorf("empty TOML key at line %d", lineNo+1)
		}
		if strings.TrimSpace(parts[1]) == "" {
			return fmt.Errorf("empty TOML value at line %d", lineNo+1)
		}
		collectionDepth += tomlCollectionDelta(parts[1])
		if collectionDepth < 0 {
			return fmt.Errorf("unbalanced TOML collection at line %d", lineNo+1)
		}
	}

	if inMultilineBasic || inMultilineLiteral {
		return fmt.Errorf("unterminated TOML multiline string")
	}
	if collectionDepth != 0 {
		return fmt.Errorf("unterminated TOML collection")
	}

	return nil
}

func tomlCollectionDelta(value string) int {
	delta := 0
	inBasic := false
	inLiteral := false
	escaped := false

	for _, r := range value {
		switch r {
		case '\\':
			escaped = !escaped && inBasic
			continue
		case '"':
			if !inLiteral && !escaped {
				inBasic = !inBasic
			}
		case '\'':
			if !inBasic {
				inLiteral = !inLiteral
			}
		case '[', '{':
			if !inBasic && !inLiteral {
				delta++
			}
		case ']', '}':
			if !inBasic && !inLiteral {
				delta--
			}
		}
		escaped = false
	}

	return delta
}

func stripTOMLComment(line string) string {
	inBasic := false
	inLiteral := false
	escaped := false

	for i, r := range line {
		switch r {
		case '\\':
			escaped = !escaped && inBasic
			continue
		case '"':
			if !inLiteral && !escaped {
				inBasic = !inBasic
			}
		case '\'':
			if !inBasic {
				inLiteral = !inLiteral
			}
		case '#':
			if !inBasic && !inLiteral {
				return line[:i]
			}
		}
		escaped = false
	}

	return line
}
