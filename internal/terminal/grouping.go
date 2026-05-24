package terminal

import (
	"crypto/sha1"
	"encoding/hex"
	"strings"
)

const ghosttyWindowIDPrefix = "mole-"

func ghosttyWindowIDForDen(den string) string {
	group := strings.TrimSpace(den)
	if group == "" {
		return ""
	}

	var b strings.Builder
	lastDash := false
	for _, r := range strings.ToLower(group) {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
			lastDash = false
		case r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == '.' || r == '_':
			b.WriteRune(r)
			lastDash = false
		case r == '-' || r == ' ':
			if lastDash || b.Len() == 0 {
				continue
			}
			b.WriteRune('-')
			lastDash = true
		default:
			if lastDash || b.Len() == 0 {
				continue
			}
			b.WriteRune('-')
			lastDash = true
		}
	}

	safeName := strings.TrimRight(b.String(), "-")
	if safeName == "" {
		safeName = "default"
	}

	sum := sha1.Sum([]byte(group))
	shortHash := hex.EncodeToString(sum[:])[:8]
	return ghosttyWindowIDPrefix + safeName + "-" + shortHash
}
