package cli

import (
	"fmt"
	"strconv"
	"strings"

	"mole/internal/inventory"

	"github.com/spf13/cobra"
)

func newHostCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "host",
		Short: "Manage SSH hosts",
	}

	cmd.AddCommand(newHostListCmd(state))
	cmd.AddCommand(newHostShowCmd(state))
	cmd.AddCommand(newHostAddCmd(state))
	cmd.AddCommand(newHostRemoveCmd(state))
	cmd.AddCommand(newHostImportCmd(state))
	cmd.AddCommand(newHostSSHCmd(state))

	return cmd
}

func newHostListCmd(state *State) *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:     "list",
		Short:   "List all SSH hosts",
		Aliases: []string{"ls"},
		RunE: func(cmd *cobra.Command, args []string) error {
			inv, err := state.InvMgr.GetInventory()
			if err != nil {
				return err
			}
			if jsonOut {
				return printJSON(inv.Hosts)
			}
			if len(inv.Hosts) == 0 {
				fmt.Println("No hosts configured.")
				return nil
			}
			for _, h := range inv.Hosts {
				addr := hostAddr(h, inv.Defaults)
				tags := ""
				if len(h.Tags) > 0 {
					tags = " [" + strings.Join(h.Tags, ", ") + "]"
				}
				bastion := ""
				if h.BastionID != "" {
					bastion = " (bastion)"
				}
				fmt.Printf("  %s  %s%s%s  (%s)\n", iconForHost(&h), h.Name, addr, tags+bastion, h.ID)
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	return cmd
}

func newHostShowCmd(state *State) *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:   "show <name|id>",
		Short: "Show host details",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			h, err := findHost(state.InvMgr, args[0])
			if err != nil {
				return err
			}
			if jsonOut {
				return printJSON(h)
			}
			fmt.Printf("Name:     %s\n", h.Name)
			fmt.Printf("ID:       %s\n", h.ID)
			fmt.Printf("Host:     %s\n", h.Host)
			if h.User != "" {
				fmt.Printf("User:     %s\n", h.User)
			}
			if h.Port != 0 {
				fmt.Printf("Port:     %d\n", h.Port)
			}
			if h.IdentityFile != "" {
				fmt.Printf("Identity: %s\n", h.IdentityFile)
			}
			if h.BastionID != "" {
				fmt.Printf("Bastion:  %s\n", h.BastionID)
			}
			if len(h.Tags) > 0 {
				fmt.Printf("Tags:     %s\n", strings.Join(h.Tags, ", "))
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	return cmd
}

func newHostAddCmd(state *State) *cobra.Command {
	var hostAddr, user, identity string
	var port int
	var tags []string
	cmd := &cobra.Command{
		Use:   "add <name>",
		Short: "Add an SSH host",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if hostAddr == "" {
				return fmt.Errorf("--host is required")
			}
			h := inventory.Host{
				Name:         args[0],
				Host:         hostAddr,
				User:         user,
				Port:         port,
				IdentityFile: identity,
				Tags:         tags,
			}
			if err := state.InvMgr.SaveHost(h); err != nil {
				return err
			}
			fmt.Printf("Added host: %s\n", h.Name)
			return nil
		},
	}
	cmd.Flags().StringVarP(&hostAddr, "host", "H", "", "Hostname or IP (required)")
	cmd.Flags().StringVarP(&user, "user", "u", "", "SSH user")
	cmd.Flags().IntVarP(&port, "port", "p", 0, "SSH port")
	cmd.Flags().StringVarP(&identity, "identity", "i", "", "Identity file path")
	cmd.Flags().StringArrayVar(&tags, "tag", nil, "Tag (repeatable)")
	cmd.MarkFlagRequired("host")
	return cmd
}

func newHostRemoveCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "remove <name|id>",
		Short: "Remove an SSH host",
		Aliases: []string{"rm"},
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			h, err := findHost(state.InvMgr, args[0])
			if err != nil {
				return err
			}
			if err := state.InvMgr.DeleteHost(h.ID); err != nil {
				return err
			}
			fmt.Printf("Removed host: %s\n", h.Name)
			return nil
		},
	}
	return cmd
}

func newHostImportCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "import-ssh [path]",
		Short: "Import hosts from ~/.ssh/config",
		RunE: func(cmd *cobra.Command, args []string) error {
			path := ""
			if len(args) > 0 {
				path = args[0]
			}
			preview, err := state.InvMgr.PreviewSSHConfigImport(path)
			if err != nil {
				return err
			}
			if len(preview.Candidates) == 0 {
				fmt.Println("No hosts found in SSH config.")
				return nil
			}

			importableCount := 0
			for _, c := range preview.Candidates {
				if c.Importable {
					importableCount++
				}
			}
			fmt.Printf("Preview: %d hosts (%d importable)\n", len(preview.Candidates), importableCount)
			for _, c := range preview.Candidates {
				status := ""
				if !c.Importable {
					status = fmt.Sprintf(" [BLOCKED: %s]", c.BlockedReason)
				} else if c.ConflictKind != "" {
					status = fmt.Sprintf(" [conflict: %s]", c.ConflictHostName)
				}
				fmt.Printf("  %s (%s)%s\n", c.Alias, c.Host, status)
			}

			// Auto-import all importable candidates
			aliases := make([]string, 0)
			for _, c := range preview.Candidates {
				if c.Importable {
					aliases = append(aliases, c.Alias)
				}
			}
			if len(aliases) == 0 {
				fmt.Println("No importable hosts.")
				return nil
			}
			if err := state.InvMgr.ImportSSHConfig(inventory.SSHConfigImportRequest{
				Aliases: aliases,
			}); err != nil {
				return err
			}
			fmt.Printf("Imported %d hosts.\n", len(aliases))
			return nil
		},
	}
	return cmd
}

func newHostSSHCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "ssh <name|id>",
		Short: "Print SSH command for a host",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			h, err := findHost(state.InvMgr, args[0])
			if err != nil {
				return err
			}
			sshCmd, err := state.InvMgr.BuildSSHCommand(h.ID)
			if err != nil {
				return err
			}
			fmt.Println(sshCmd)
			return nil
		},
	}
	return cmd
}

// --- helpers ---

func hostAddr(h inventory.Host, defaults inventory.HostDefaults) string {
	parts := []string{}
	user := h.User
	if user == "" {
		user = defaults.User
	}
	port := h.Port
	if port == 0 {
		port = defaults.Port
	}
	if user != "" {
		parts = append(parts, user+"@"+h.Host)
	} else {
		parts = append(parts, h.Host)
	}
	if port != 0 && port != 22 {
		parts = append(parts, ":"+strconv.Itoa(port))
	}
	return "(" + strings.Join(parts, "") + ")"
}

func iconForHost(h *inventory.Host) string {
	if h.BastionID != "" || len(h.JumpHostIDs) > 0 {
		return "J"
	}
	return "H"
}