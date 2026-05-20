package cli

import (
	"fmt"

	"mole/internal/config"

	"github.com/spf13/cobra"
)

func newSettingsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "settings",
		Short: "Manage app settings",
	}

	cmd.AddCommand(newSettingsShowCmd())
	cmd.AddCommand(newSettingsSetTerminalCmd())

	return cmd
}

func newSettingsShowCmd() *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:   "show",
		Short: "Show current settings",
		RunE: func(cmd *cobra.Command, args []string) error {
			settings, err := config.LoadSettings()
			if err != nil {
				return err
			}
			if jsonOut {
				return printJSON(settings)
			}
			terminal := settings.DefaultTerminal
			if terminal == "" {
				terminal = "(auto-detect)"
			}
			fmt.Printf("Default Terminal: %s\n", terminal)
			return nil
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	return cmd
}

func newSettingsSetTerminalCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "set-terminal <id>",
		Short: "Set default terminal (e.g., iterm2, ghostty, terminal)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			settings, err := config.LoadSettings()
			if err != nil {
				settings = &config.Settings{}
			}
			settings.DefaultTerminal = args[0]
			if err := config.SaveSettings(settings); err != nil {
				return err
			}
			fmt.Printf("Default terminal set to: %s\n", args[0])
			return nil
		},
	}
	return cmd
}
