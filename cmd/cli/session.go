package cli

import (
	"fmt"
	"strings"

	"mole/internal/inventory"
	"mole/internal/session"

	"github.com/spf13/cobra"
)

func newSessionCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:     "session",
		Short:   "Manage terminal sessions",
		Aliases: []string{"s"},
	}

	cmd.AddCommand(newSessionListCmd(state))
	cmd.AddCommand(newSessionShowCmd(state))
	cmd.AddCommand(newSessionCreateCmd(state))
	cmd.AddCommand(newSessionAttachCmd(state))
	cmd.AddCommand(newSessionKillCmd(state))
	cmd.AddCommand(newSessionDetachCmd(state))
	cmd.AddCommand(newSessionRestartCmd(state))

	return cmd
}

func newSessionListCmd(state *State) *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:     "list",
		Short:   "List all sessions",
		Aliases: []string{"ls"},
		RunE: func(cmd *cobra.Command, args []string) error {
			statuses, err := state.SessionMgr.ListWithStatus()
			if err != nil {
				return err
			}
			if jsonOut {
				return printJSON(statuses)
			}
			if len(statuses) == 0 {
				fmt.Println("No sessions found.")
				return nil
			}
			for _, s := range statuses {
				stateIcon := " "
				if s.Alive {
					if s.Attached {
						stateIcon = "*"
					} else {
						stateIcon = "+"
					}
				}
				den := ""
				if s.Den != "" {
					den = fmt.Sprintf(" [%s]", s.Den)
				}
				profileName := s.ProfileName
				if profileName == "" {
					profileName = s.ProfileID
				}
				fmt.Printf(" %s %s  %s%s  (%s)\n", stateIcon, s.Name, profileName, den, s.ID)
			}
			fmt.Println("\n  * attached  + alive    dead")
			return nil
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	return cmd
}

func newSessionShowCmd(state *State) *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:   "show <name|id>",
		Short: "Show session details",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sess, err := findSession(state.SessionMgr, args[0])
			if err != nil {
				return err
			}
			if jsonOut {
				return printJSON(sess)
			}
			fmt.Printf("Name:       %s\n", sess.Name)
			fmt.Printf("ID:         %s\n", sess.ID)
			fmt.Printf("Profile:    %s (%s)\n", sess.ProfileName, sess.ProfileID)
			fmt.Printf("Status:     alive=%v attached=%v windows=%d\n", sess.Alive, sess.Attached, sess.Windows)
			if sess.Command != "" {
				fmt.Printf("Command:    %s\n", sess.Command)
			}
			if sess.RunMode != "" {
				fmt.Printf("Run Mode:   %s\n", sess.RunMode)
			}
			if sess.Cwd != "" {
				fmt.Printf("CWD:        %s\n", sess.Cwd)
			}
			if sess.Den != "" {
				fmt.Printf("Den:        %s\n", sess.Den)
			}
			if sess.HostID != "" {
				host, hostErr := findHost(state.InvMgr, sess.HostID)
				if hostErr == nil {
					fmt.Printf("Host:       %s (%s)\n", host.Name, host.Host)
				} else {
					fmt.Printf("Host:       %s\n", sess.HostID)
				}
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	return cmd
}

func newSessionCreateCmd(state *State) *cobra.Command {
	var profileName, sessName, command, runMode, cwd, den, host string
	cmd := &cobra.Command{
		Use:   "create",
		Short: "Create a new session",
		RunE: func(cmd *cobra.Command, args []string) error {
			if sessName == "" {
				return fmt.Errorf("--name is required")
			}
			p, err := findProfile(state.ProfileMgr, profileName)
			if err != nil {
				return err
			}

			var hostID string
			if host != "" {
				h, hostErr := findHost(state.InvMgr, host)
				if hostErr != nil {
					return hostErr
				}
				hostID = h.ID
				if runMode == "" {
					runMode = session.RunModeHost
				}
			}

			if runMode == "" {
				runMode = inferSessionRunMode(command)
			}

			if err := state.SessionMgr.CreateWithRequest(session.SessionLaunchRequest{
				ProfileID: p.ID,
				Name:      sessName,
				Command:   command,
				RunMode:   runMode,
				HostID:    hostID,
				Cwd:       cwd,
				Den:       den,
			}); err != nil {
				return err
			}
			saved, _ := findSession(state.SessionMgr, sessName)
			fmt.Printf("Created session: %s (%s)\n", saved.Name, saved.ID)
			return nil
		},
	}
	cmd.Flags().StringVarP(&sessName, "name", "n", "", "Session name (required)")
	cmd.Flags().StringVarP(&profileName, "profile", "p", "", "Profile name or ID (required)")
	cmd.Flags().StringVarP(&command, "command", "c", "", "Startup command")
	cmd.Flags().StringVar(&runMode, "mode", "", "Run mode (shell, custom, host, codex, script)")
	cmd.Flags().StringVar(&cwd, "cwd", "", "Working directory")
	cmd.Flags().StringVarP(&den, "den", "d", "", "Den group name")
	cmd.Flags().StringVar(&host, "host", "", "SSH host name or ID")
	cmd.MarkFlagRequired("name")
	cmd.MarkFlagRequired("profile")
	return cmd
}

func newSessionAttachCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:     "attach <name|id>",
		Short:   "Attach to a session",
		Args:    cobra.ExactArgs(1),
		Aliases: []string{"a"},
		RunE: func(cmd *cobra.Command, args []string) error {
			sess, err := findSession(state.SessionMgr, args[0])
			if err != nil {
				return err
			}
			_, attachErr := state.SessionMgr.Attach(sess.ID)
			if attachErr != nil {
				return attachErr
			}
			fmt.Printf("Attaching to session: %s\n", sess.Name)
			return nil
		},
	}
	return cmd
}

func newSessionKillCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "kill <name|id>",
		Short: "Kill a session",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sess, err := findSession(state.SessionMgr, args[0])
			if err != nil {
				return err
			}
			if err := state.SessionMgr.Kill(sess.ID); err != nil {
				return err
			}
			fmt.Printf("Killed session: %s\n", sess.Name)
			return nil
		},
	}
	return cmd
}

func newSessionDetachCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "detach <name|id>",
		Short: "Detach from a session",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sess, err := findSession(state.SessionMgr, args[0])
			if err != nil {
				return err
			}
			if err := state.SessionMgr.Detach(sess.ID); err != nil {
				return err
			}
			fmt.Printf("Detached session: %s\n", sess.Name)
			return nil
		},
	}
	return cmd
}

func newSessionRestartCmd(state *State) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "restart <name|id>",
		Short: "Restart a dead session",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sess, err := findSession(state.SessionMgr, args[0])
			if err != nil {
				return err
			}
			if err := state.SessionMgr.Restart(sess.ID); err != nil {
				return err
			}
			fmt.Printf("Restarted session: %s\n", sess.Name)
			return nil
		},
	}
	return cmd
}

// --- helpers ---

func findSession(mgr *session.Manager, ref string) (session.SessionStatus, error) {
	statuses, err := mgr.ListWithStatus()
	if err != nil {
		return session.SessionStatus{}, err
	}
	// exact ID match
	for _, s := range statuses {
		if s.ID == ref {
			return s, nil
		}
	}
	// exact name match
	for _, s := range statuses {
		if strings.EqualFold(s.Name, ref) {
			return s, nil
		}
	}
	// fuzzy name match
	var matches []session.SessionStatus
	for _, s := range statuses {
		if strings.Contains(strings.ToLower(s.Name), strings.ToLower(ref)) {
			matches = append(matches, s)
		}
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	if len(matches) > 1 {
		return session.SessionStatus{}, fmt.Errorf("multiple sessions match %q, be more specific", ref)
	}
	return session.SessionStatus{}, fmt.Errorf("session %q not found", ref)
}

func findHost(mgr *inventory.Manager, ref string) (inventory.Host, error) {
	inv, err := mgr.GetInventory()
	if err != nil {
		return inventory.Host{}, err
	}
	// exact ID match
	for _, h := range inv.Hosts {
		if h.ID == ref {
			return h, nil
		}
	}
	// exact name match
	for _, h := range inv.Hosts {
		if strings.EqualFold(h.Name, ref) {
			return h, nil
		}
	}
	// fuzzy name match
	var matches []inventory.Host
	for _, h := range inv.Hosts {
		if strings.Contains(strings.ToLower(h.Name), strings.ToLower(ref)) {
			matches = append(matches, h)
		}
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	if len(matches) > 1 {
		return inventory.Host{}, fmt.Errorf("multiple hosts match %q, be more specific", ref)
	}
	return inventory.Host{}, fmt.Errorf("host %q not found", ref)
}

func inferSessionRunMode(command string) string {
	if strings.TrimSpace(command) == "" {
		return session.RunModeShell
	}
	return session.RunModeCustom
}
