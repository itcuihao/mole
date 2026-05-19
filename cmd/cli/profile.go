package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"mole/internal/profile"

	"github.com/spf13/cobra"
)

func newProfileCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "profile",
		Short: "Manage AI provider profiles",
	}

	cmd.AddCommand(newProfileListCmd(state))
	cmd.AddCommand(newProfileShowCmd(state))
	cmd.AddCommand(newProfileCreateCmd(state))
	cmd.AddCommand(newProfileDeleteCmd(state))

	return cmd
}

func newProfileListCmd(state *State) *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:   "list",
		Short: "List all profiles",
		RunE: func(cmd *cobra.Command, args []string) error {
			profiles, err := state.ProfileMgr.List()
			if err != nil {
				return err
			}
			if jsonOut {
				return printJSON(profiles)
			}
			if len(profiles) == 0 {
				fmt.Println("No profiles found.")
				return nil
			}
			for _, p := range profiles {
				fmt.Printf("  %s  %s", colorDot(p.Color), p.Name)
				if p.Description != "" {
					fmt.Printf("  %s", p.Description)
				}
				if p.DefaultCommand != "" {
					fmt.Printf("  [%s]", p.DefaultCommand)
				}
				fmt.Printf("  (%s)\n", p.ID)
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	return cmd
}

func newProfileShowCmd(state *State) *cobra.Command {
	var revealed bool
	var jsonOut bool
	cmd := &cobra.Command{
		Use:   "show <name|id>",
		Short: "Show profile details",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			p, err := findProfile(state.ProfileMgr, args[0])
			if err != nil {
				return err
			}
			if jsonOut {
				return printJSON(p)
			}
			fmt.Printf("Name:        %s\n", p.Name)
			fmt.Printf("ID:          %s\n", p.ID)
			if p.Description != "" {
				fmt.Printf("Description: %s\n", p.Description)
			}
			if p.DefaultCommand != "" {
				fmt.Printf("Command:     %s\n", p.DefaultCommand)
			}
			if p.Color != "" {
				fmt.Printf("Color:       %s\n", p.Color)
			}
			if len(p.EnvVars) > 0 {
				fmt.Println("Env Vars:")
				for k, v := range p.EnvVars {
					if !revealed && isSecretKey(p.SecretKeys, k) {
						fmt.Printf("  %s=***\n", k)
					} else {
						fmt.Printf("  %s=%s\n", k, v)
					}
				}
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&revealed, "reveal", false, "Show secret values in plain text")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	return cmd
}

func newProfileCreateCmd(state *State) *cobra.Command {
	var name, desc, color, defaultCmd string
	var envVars []string
	var secretKeys []string
	cmd := &cobra.Command{
		Use:   "create",
		Short: "Create a new profile",
		RunE: func(cmd *cobra.Command, args []string) error {
			if name == "" {
				return fmt.Errorf("--name is required")
			}
			env := parseKeyValue(envVars)
			p := profile.Profile{
				Name:           name,
				Description:    desc,
				Color:          color,
				DefaultCommand: defaultCmd,
				EnvVars:        env,
				SecretKeys:     secretKeys,
			}
			if err := state.ProfileMgr.Save(p, nil); err != nil {
				return err
			}
			saved, _ := findProfile(state.ProfileMgr, name)
			fmt.Printf("Created profile: %s (%s)\n", saved.Name, saved.ID)
			return nil
		},
	}
	cmd.Flags().StringVarP(&name, "name", "n", "", "Profile name (required)")
	cmd.Flags().StringVar(&desc, "desc", "", "Description")
	cmd.Flags().StringVar(&color, "color", "", "Color (hex)")
	cmd.Flags().StringVar(&defaultCmd, "command", "", "Default startup command")
	cmd.Flags().StringArrayVar(&envVars, "env", nil, "Env var in KEY=VALUE format (repeatable)")
	cmd.Flags().StringArrayVar(&secretKeys, "secret-key", nil, "Keys to treat as secrets (repeatable)")
	return cmd
}

func newProfileDeleteCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "delete <name|id>",
		Short: "Delete a profile",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			p, err := findProfile(state.ProfileMgr, args[0])
			if err != nil {
				return err
			}
			if err := state.ProfileMgr.Delete(p.ID); err != nil {
				return err
			}
			fmt.Printf("Deleted profile: %s\n", p.Name)
			return nil
		},
	}
	return cmd
}

// --- helpers ---

func findProfile(mgr *profile.Manager, ref string) (profile.Profile, error) {
	profiles, err := mgr.List()
	if err != nil {
		return profile.Profile{}, err
	}
	// exact ID match first
	for _, p := range profiles {
		if p.ID == ref {
			return p, nil
		}
	}
	// exact name match
	for _, p := range profiles {
		if strings.EqualFold(p.Name, ref) {
			return p, nil
		}
	}
	// fuzzy name match
	var matches []profile.Profile
	for _, p := range profiles {
		if strings.Contains(strings.ToLower(p.Name), strings.ToLower(ref)) {
			matches = append(matches, p)
		}
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	if len(matches) > 1 {
		return profile.Profile{}, fmt.Errorf("multiple profiles match %q, be more specific", ref)
	}
	return profile.Profile{}, fmt.Errorf("profile %q not found", ref)
}

func colorDot(color string) string {
	if color == "" {
		return " "
	}
	// Map common color names to ANSI codes for terminal display
	switch color {
	case "#EF4444", "red":
		return "\033[31m●\033[0m"
	case "#F97316", "orange":
		return "\033[33m●\033[0m"
	case "#EAB308", "yellow":
		return "\033[93m●\033[0m"
	case "#22C55E", "green":
		return "\033[32m●\033[0m"
	case "#3B82F6", "blue":
		return "\033[34m●\033[0m"
	case "#8B5CF6", "purple":
		return "\033[35m●\033[0m"
	case "#EC4899", "pink":
		return "\033[95m●\033[0m"
	case "#6B7280", "gray":
		return "\033[90m●\033[0m"
	default:
		return "●"
	}
}

func isSecretKey(keys []string, key string) bool {
	for _, k := range keys {
		if strings.EqualFold(k, key) {
			return true
		}
	}
	return false
}

func parseKeyValue(pairs []string) map[string]string {
	m := make(map[string]string)
	for _, p := range pairs {
		idx := strings.Index(p, "=")
		if idx < 0 {
			continue
		}
		k := strings.TrimSpace(p[:idx])
		v := strings.TrimSpace(p[idx+1:])
		if k != "" {
			m[k] = v
		}
	}
	return m
}

func printJSON(v interface{}) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func marshalJSON(v interface{}) (string, error) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}