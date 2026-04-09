package inventory

import (
	"fmt"

	"github.com/google/uuid"
)

// Manager coordinates inventory storage.
type Manager struct {
	store *Store
}

// NewManager creates a new inventory Manager.
func NewManager(storePath string) *Manager {
	return &Manager{
		store: NewStore(storePath),
	}
}

// GetInventory returns the full inventory.
func (m *Manager) GetInventory() (Inventory, error) {
	inv, err := m.store.Load()
	if err != nil {
		return Inventory{}, err
	}
	m.normalize(&inv)
	return inv, nil
}

// SaveInventory replaces the entire inventory.
func (m *Manager) SaveInventory(inv Inventory) error {
	m.normalize(&inv)
	return m.store.Save(inv)
}

// SaveDefaults updates default SSH values.
func (m *Manager) SaveDefaults(defaults HostDefaults) error {
	return m.store.Update(func(inv *Inventory) error {
		inv.Defaults = defaults
		m.normalize(inv)
		return nil
	})
}

// SaveHost creates or updates a host.
func (m *Manager) SaveHost(h Host) error {
	return m.store.Update(func(inv *Inventory) error {
		if h.ID == "" {
			h.ID = uuid.New().String()
			inv.Hosts = append(inv.Hosts, h)
			m.normalize(inv)
			return nil
		}

		for i, existing := range inv.Hosts {
			if existing.ID == h.ID {
				inv.Hosts[i] = h
				m.normalize(inv)
				return nil
			}
		}

		inv.Hosts = append(inv.Hosts, h)
		m.normalize(inv)
		return nil
	})
}

// DeleteHost removes a host and cleans group references.
func (m *Manager) DeleteHost(id string) error {
	return m.store.Update(func(inv *Inventory) error {
		filtered := inv.Hosts[:0]
		for _, h := range inv.Hosts {
			if h.ID != id {
				filtered = append(filtered, h)
			}
		}
		inv.Hosts = filtered

		for i := range inv.Groups {
			group := inv.Groups[i]
			hostIDs := group.HostIDs[:0]
			for _, hostID := range group.HostIDs {
				if hostID != id {
					hostIDs = append(hostIDs, hostID)
				}
			}
			group.HostIDs = hostIDs
			inv.Groups[i] = group
		}

		for i, h := range inv.Hosts {
			if h.BastionID == id {
				h.BastionID = ""
				inv.Hosts[i] = h
			}
		}

		m.normalize(inv)
		return nil
	})
}

// SaveGroup creates or updates a host group.
func (m *Manager) SaveGroup(g HostGroup) error {
	return m.store.Update(func(inv *Inventory) error {
		if g.ID == "" {
			g.ID = uuid.New().String()
			inv.Groups = append(inv.Groups, g)
			m.normalize(inv)
			return nil
		}

		for i, existing := range inv.Groups {
			if existing.ID == g.ID {
				inv.Groups[i] = g
				m.normalize(inv)
				return nil
			}
		}

		inv.Groups = append(inv.Groups, g)
		m.normalize(inv)
		return nil
	})
}

// DeleteGroup removes a group by ID.
func (m *Manager) DeleteGroup(id string) error {
	return m.store.Update(func(inv *Inventory) error {
		filtered := inv.Groups[:0]
		for _, g := range inv.Groups {
			if g.ID != id {
				filtered = append(filtered, g)
			}
		}
		inv.Groups = filtered
		m.normalize(inv)
		return nil
	})
}

// BuildSSHCommand returns the current SSH command for a stored host.
func (m *Manager) BuildSSHCommand(hostID string) (string, error) {
	inv, err := m.store.Load()
	if err != nil {
		return "", err
	}
	m.normalize(&inv)

	hostMap := make(map[string]Host, len(inv.Hosts))
	var selected *Host
	for i := range inv.Hosts {
		host := inv.Hosts[i]
		hostMap[host.ID] = host
		if host.ID == hostID {
			copy := host
			selected = &copy
		}
	}

	if selected == nil {
		return "", fmt.Errorf("host %q not found", hostID)
	}
	if selected.Host == "" {
		return "", fmt.Errorf("host %q has no address configured", hostID)
	}

	return buildSSHCommand(*selected, inv.Defaults, hostMap), nil
}

func (m *Manager) normalize(inv *Inventory) {
	if inv.Version == 0 {
		inv.Version = 1
	}
	if inv.Defaults.Port == 0 {
		inv.Defaults.Port = 22
	}
	if inv.Hosts == nil {
		inv.Hosts = []Host{}
	}
	if inv.Groups == nil {
		inv.Groups = []HostGroup{}
	}
	for i, h := range inv.Hosts {
		if h.Tags == nil {
			h.Tags = []string{}
			inv.Hosts[i] = h
		}
	}
	for i, g := range inv.Groups {
		if g.HostIDs == nil {
			g.HostIDs = []string{}
		}
		if g.Tags == nil {
			g.Tags = []string{}
		}
		inv.Groups[i] = g
	}
}

func buildSSHCommand(host Host, defaults HostDefaults, hostMap map[string]Host) string {
	if host.Host == "" {
		return ""
	}

	user := host.User
	if user == "" {
		user = defaults.User
	}

	port := host.Port
	if port == 0 {
		port = defaults.Port
	}

	identity := host.IdentityFile
	if identity == "" {
		identity = defaults.IdentityFile
	}

	parts := []string{"ssh"}
	if identity != "" {
		parts = append(parts, "-i", identity)
	}
	if port != 0 && port != 22 {
		parts = append(parts, "-p", fmt.Sprintf("%d", port))
	}

	if host.BastionID != "" {
		if bastion, ok := hostMap[host.BastionID]; ok && bastion.Host != "" {
			bastionUser := bastion.User
			if bastionUser == "" {
				bastionUser = defaults.User
			}
			bastionTarget := bastion.Host
			if bastionUser != "" {
				bastionTarget = fmt.Sprintf("%s@%s", bastionUser, bastion.Host)
			}
			parts = append(parts, "-J", bastionTarget)
		}
	}

	target := host.Host
	if user != "" {
		target = fmt.Sprintf("%s@%s", user, host.Host)
	}

	return fmt.Sprintf("%s %s", parts[0], joinArgs(append(parts[1:], target)))
}

func joinArgs(args []string) string {
	if len(args) == 0 {
		return ""
	}

	result := args[0]
	for _, arg := range args[1:] {
		result += " " + arg
	}
	return result
}
