package cli

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"mole/internal/session"

	"github.com/spf13/cobra"
)

// MOLE_ICON is the base64-encoded mole mascot icon for xbar/SwiftBar menu bar display.
const MOLE_ICON = "iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAABmJLR0QA/wD/AP+gvaeTAAACdklEQVQ4jbWTT0hUURTGv3PvqDOjM2YNaTvTCrIMyqCCSAgi/6yiVVoREggKWZvQ9umqxKBFfyhokySEECoWBEGLFkF/EFtYWhvHJsOZ96Z5b+bN3NOiYRrfm+dMi77dd+79fve88+4F/pMo33SOfd6riNXMpZ3zAHBydH6bIHGeQPsZCGUDqwx+p1g9mr3SFAaA9lsLTYJJTA3smCsIvvBwyRuJJd+D+Klg8YGBEQYCLh3pivkqgAYi9Ehf/MCz3oOJgmAA6Bj7NAwWPQBkiV+dAakH0wO7r+UXhX2Xh2kcDLNEKMAwPUzj9rIDnFZoAaGyZDChMq3QUhRMQrSXDM2FqK0oGKSa8y2zAphd/Z8MmmGTA8xMNfl+cXK4enFyuNrNZ7XZzvE4OrbdBkuLSGZy9YUybuB1OtQ1FG/dFag4ut2/CQBe11+3Xi3Ek7EiuQ3BRxr95ZePHw4Kw0Cstw8gwrk7tz3dJ3wVoy9/aG++JFJuWefPy8pXLqivNRSQgqB0HfwrDo7rUJoOKQj9x0IBbxk5ZlK0461Bj/CVCQIAWVcL39luQBBkXW3u4Npgmfj2M5X5J3A4ainNVCroFQIAvKdPrVuPmUotRy3llncdRSrNfPNFRDcsxfY1I6X4xvOIbmXsF3rjjuMAqgBgbtm0+h8vr7XtqfLWb6mQALC0amZm53VTM1SuWwK0EsC8BFDuJWlGWj15G0049/2VAn+11wqMQsxsBCkkwc6MA1xpyrsE+l46llb8SXmvKHhisDHGUp4BIVyciTCk7JoYbHQ8RNcL3jnysYZ93osM1UEQDQD7s5EEQy0SxDQZ5v2poX1rhfK/AaGu8i3WrlDhAAAAAElFTkSuQmCC"

func newXbarCmd(state *State) *cobra.Command {
	var template string
	cmd := &cobra.Command{
		Use:   "xbar",
		Short: "Generate xbar/SwiftBar menu bar output",
		Long: `Generate menu bar plugin output for xbar or SwiftBar.

Intended to be called from the xbar/SwiftBar plugin script.
Outputs menu lines that let you view and attach sessions, open dens,
and launch the Mole dashboard — all from the macOS menu bar.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runXbar(state, template)
		},
	}
	cmd.Flags().StringVarP(&template, "template", "t", "compact", "Template: compact, detailed, or minimal")
	return cmd
}

func runXbar(state *State, template string) error {
	statuses, err := state.SessionMgr.ListWithStatus()
	if err != nil {
		fmt.Printf(" | image=%s\n", MOLE_ICON)
		fmt.Println("---")
		fmt.Printf("Error loading sessions | color=#E85D3A\n")
		fmt.Println("Open Dashboard | shell=open param1=-a param2=Mole terminal=false")
		return nil
	}

	denSessions, noDen := groupSessionsByDen(statuses)

	switch template {
	case "detailed":
		return renderDetailed(statuses, denSessions, noDen)
	case "minimal":
		return renderMinimal(statuses, denSessions, noDen)
	default:
		return renderCompact(statuses, denSessions, noDen)
	}
}

func groupSessionsByDen(statuses []session.SessionStatus) (map[string][]session.SessionStatus, []session.SessionStatus) {
	denSessions := make(map[string][]session.SessionStatus)
	var noDen []session.SessionStatus

	for _, s := range statuses {
		den := strings.TrimSpace(s.Den)
		if den != "" {
			denSessions[den] = append(denSessions[den], s)
		} else {
			noDen = append(noDen, s)
		}
	}

	for den := range denSessions {
		sort.Slice(denSessions[den], func(i, j int) bool {
			return denSessions[den][i].Name < denSessions[den][j].Name
		})
	}

	return denSessions, noDen
}

var denColorMap = map[string]string{
	"mole":    "#4A90D9",
	"huoshan": "#E85D3A",
}

func denColor(den string) string {
	if c, ok := denColorMap[den]; ok {
		return c
	}
	return "#9B59B6"
}

func recentSortKey(s session.SessionStatus) string {
	if s.LastOpenedAt != "" {
		return s.LastOpenedAt
	}
	return s.CreatedAt
}

func sortedKeys(m map[string][]session.SessionStatus) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// execPath returns the path to the current mole binary for use in xbar click actions.
func execPath() string {
	p, err := os.Executable()
	if err != nil {
		return "mole"
	}
	return p
}

// --- compact template (default) ---

func renderCompact(_ []session.SessionStatus, denSessions map[string][]session.SessionStatus, noDen []session.SessionStatus) error {
	bin := execPath()
	fmt.Printf(" | image=%s\n", MOLE_ICON)
	fmt.Println("---")

	denNames := sortedKeys(denSessions)

	if len(denNames) > 0 {
		for _, den := range denNames {
			burrows := denSessions[den]
			color := denColor(den)
			fmt.Printf("%s (%d) | color=%s\n", den, len(burrows), color)

			maxInline := 3
			shown := burrows
			if len(burrows) > maxInline {
				shown = burrows[:maxInline]
			}
			for _, b := range shown {
				fmt.Printf("-- %s | color=#DDD shell=%s param1=session param2=attach param3=%s terminal=false\n", b.Name, bin, b.Name)
			}
			restCount := len(burrows) - maxInline
			if restCount > 0 {
				fmt.Printf("-- More (%d) | color=#888\n", restCount)
			}
			fmt.Println("-- ---")
			fmt.Printf("-- Open %s | color=%s shell=%s param1=den param2=open param3=%s terminal=false\n", den, color, bin, den)
		}
	}

	if len(denNames) > 0 && len(noDen) > 0 {
		fmt.Println("---")
	}

	if len(noDen) > 0 {
		fmt.Printf("Burrows (%d) | color=#9B59B6\n", len(noDen))
		sort.Slice(noDen, func(i, j int) bool {
			return recentSortKey(noDen[i]) > recentSortKey(noDen[j])
		})
		maxInline := 3
		shown := noDen
		if len(noDen) > maxInline {
			shown = noDen[:maxInline]
		}
		for _, b := range shown {
			fmt.Printf("-- %s | color=#AAA shell=%s param1=session param2=attach param3=%s terminal=false\n", b.Name, bin, b.Name)
		}
		restCount := len(noDen) - maxInline
		if restCount > 0 {
			fmt.Printf("-- More (%d) | color=#888\n", restCount)
		}
		fmt.Println("-- ---")
		fmt.Println("-- Open Dashboard | color=#9B59B6 shell=open param1=-a param2=Mole terminal=false")
	}

	fmt.Println("---")
	fmt.Println("Open Dashboard | color=#4A90D9 shell=open param1=-a param2=Mole terminal=false")
	return nil
}

// --- detailed template ---

func renderDetailed(statuses []session.SessionStatus, denSessions map[string][]session.SessionStatus, noDen []session.SessionStatus) error {
	bin := execPath()
	total := len(statuses)
	fmt.Printf(" %d | image=%s\n", total, MOLE_ICON)
	fmt.Println("---")

	denNames := sortedKeys(denSessions)

	if len(denNames) > 0 {
		for _, den := range denNames {
			burrows := denSessions[den]
			color := denColor(den)
			fmt.Printf("%s (%d) | color=%s\n", den, len(burrows), color)
			for _, b := range burrows {
				fmt.Printf("-- %s | color=#DDD shell=%s param1=session param2=attach param3=%s terminal=false\n", b.Name, bin, b.Name)
			}
			fmt.Println("-- ---")
			fmt.Printf("-- Open %s | color=%s shell=%s param1=den param2=open param3=%s terminal=false\n", den, color, bin, den)
		}
	}

	if len(denNames) > 0 && len(noDen) > 0 {
		fmt.Println("---")
	}

	if len(noDen) > 0 {
		fmt.Printf("Burrows (%d) | color=#9B59B6\n", len(noDen))
		sort.Slice(noDen, func(i, j int) bool {
			return recentSortKey(noDen[i]) > recentSortKey(noDen[j])
		})
		for _, b := range noDen {
			fmt.Printf("-- %s | color=#AAA shell=%s param1=session param2=attach param3=%s terminal=false\n", b.Name, bin, b.Name)
		}
		fmt.Println("-- ---")
		fmt.Println("-- Open Dashboard | color=#9B59B6 shell=open param1=-a param2=Mole terminal=false")
	}

	fmt.Println("---")
	fmt.Println("Open Dashboard | color=#4A90D9 shell=open param1=-a param2=Mole terminal=false")
	return nil
}

// --- minimal template ---

func renderMinimal(statuses []session.SessionStatus, denSessions map[string][]session.SessionStatus, noDen []session.SessionStatus) error {
	bin := execPath()
	total := len(statuses)
	fmt.Printf(" %d | image=%s\n", total, MOLE_ICON)
	fmt.Println("---")

	denNames := sortedKeys(denSessions)

	if len(denNames) > 0 {
		fmt.Println("Dens | color=#4A90D9")
		for _, den := range denNames {
			count := len(denSessions[den])
			fmt.Printf("-- %s (%d) | color=#DDD shell=%s param1=den param2=open param3=%s terminal=false\n", den, count, bin, den)
		}
		fmt.Println("-- ---")
		fmt.Println("-- Open Dashboard | color=#4A90D9 shell=open param1=-a param2=Mole terminal=false")
	}

	if len(denNames) > 0 && len(noDen) > 0 {
		fmt.Println("---")
	}

	if len(noDen) > 0 {
		fmt.Printf("Burrows (%d) | color=#9B59B6\n", len(noDen))
		fmt.Println("-- Open Dashboard | color=#9B59B6 shell=open param1=-a param2=Mole terminal=false")
	}

	fmt.Println("---")
	fmt.Println("Open Dashboard | color=#4A90D9 shell=open param1=-a param2=Mole terminal=false")
	return nil
}