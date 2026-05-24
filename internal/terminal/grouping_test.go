package terminal

import (
	"strings"
	"testing"
)

func TestGhosttyWindowIDForDen(t *testing.T) {
	tests := []struct {
		name string
		den  string
		want string
	}{
		{name: "empty", den: "", want: ""},
		{name: "trim", den: "  project-a  ", want: "mole-project-a-526ebec5"},
		{name: "space and symbols", den: "Team A / API", want: "mole-team-a-api-d484febc"},
		{name: "unicode", den: "中文 den", want: "mole-den-9d448b7c"},
		{name: "only symbols", den: "///", want: "mole-default-c64b8480"},
		{name: "mixed separators", den: "dev__blue--01", want: "mole-dev__blue-01-69f56139"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ghosttyWindowIDForDen(tt.den); got != tt.want {
				t.Fatalf("ghosttyWindowIDForDen(%q) = %q, want %q", tt.den, got, tt.want)
			}
		})
	}
}

func TestGhosttyWindowIDForDenCollisionResistance(t *testing.T) {
	a := ghosttyWindowIDForDen("Team A / API")
	b := ghosttyWindowIDForDen("Team A - API")
	if a == b {
		t.Fatalf("expected different ids for colliding-safe names, got same id %q", a)
	}

	if !strings.HasPrefix(a, "mole-team-a-api-") {
		t.Fatalf("unexpected prefix for %q", a)
	}
	if !strings.HasPrefix(b, "mole-team-a-api-") {
		t.Fatalf("unexpected prefix for %q", b)
	}
}
