package inventory

import (
	"fmt"
	"strings"

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

// StorePath returns the underlying JSON storage file path.
func (m *Manager) StorePath() string {
	if m == nil || m.store == nil {
		return ""
	}
	return m.store.path
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

// PrepareImport normalizes imported inventory without persisting it.
func (m *Manager) PrepareImport(inv Inventory) Inventory {
	m.normalize(&inv)
	return inv
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
			if len(h.JumpHostIDs) > 0 {
				nextJumpIDs := make([]string, 0, len(h.JumpHostIDs))
				for _, jumpID := range h.JumpHostIDs {
					if jumpID != id {
						nextJumpIDs = append(nextJumpIDs, jumpID)
					}
				}
				h.JumpHostIDs = nextJumpIDs
				if len(nextJumpIDs) > 0 {
					h.BastionID = nextJumpIDs[0]
				}
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
		h.SourceAlias = strings.TrimSpace(h.SourceAlias)
		if h.Tags == nil {
			h.Tags = []string{}
		}
		if h.JumpHostIDs == nil {
			h.JumpHostIDs = []string{}
		}
		if len(h.JumpHostIDs) == 0 && strings.TrimSpace(h.BastionID) != "" {
			h.JumpHostIDs = []string{strings.TrimSpace(h.BastionID)}
		}
		filteredJumpIDs := make([]string, 0, len(h.JumpHostIDs))
		for _, jumpID := range h.JumpHostIDs {
			trimmed := strings.TrimSpace(jumpID)
			if trimmed == "" || trimmed == h.ID {
				continue
			}
			filteredJumpIDs = append(filteredJumpIDs, trimmed)
		}
		h.JumpHostIDs = uniqueStrings(filteredJumpIDs)
		if len(h.JumpHostIDs) > 0 {
			h.BastionID = h.JumpHostIDs[0]
		} else {
			h.BastionID = ""
		}
		inv.Hosts[i] = h
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

type hostConnection struct {
	target   string
	user     string
	port     int
	identity string
}

func buildSSHCommand(host Host, defaults HostDefaults, hostMap map[string]Host) string {
	if host.Host == "" {
		return ""
	}

	targetConn := resolveHostConnection(host, defaults)

	parts := []string{"ssh"}
	if targetConn.identity != "" {
		parts = append(parts, "-i", targetConn.identity)
	}
	if targetConn.port != 0 && targetConn.port != 22 {
		parts = append(parts, "-p", fmt.Sprintf("%d", targetConn.port))
	}

	jumpIDs := host.JumpHostIDs
	if len(jumpIDs) == 0 && host.BastionID != "" {
		jumpIDs = []string{host.BastionID}
	}
	if len(jumpIDs) > 0 {
		hops := make([]hostConnection, 0, len(jumpIDs))
		canUseProxyJump := true
		for _, jumpID := range jumpIDs {
			if bastion, ok := hostMap[jumpID]; ok && bastion.Host != "" {
				conn := resolveHostConnection(bastion, defaults)
				hops = append(hops, conn)
				if conn.identity != "" {
					canUseProxyJump = false
				}
			}
		}
		if len(hops) > 0 {
			if canUseProxyJump {
				jumpSpecs := make([]string, 0, len(hops))
				for _, hop := range hops {
					jumpSpecs = append(jumpSpecs, hop.jumpSpec())
				}
				parts = append(parts, "-J", strings.Join(jumpSpecs, ","))
			} else {
				parts = append(parts, "-o", fmt.Sprintf("ProxyCommand=%s", shellQuote(buildNestedProxyCommand(hops))))
			}
		}
	}

	parts = append(parts, targetConn.targetSpec())
	return joinArgs(parts)
}

func joinArgs(args []string) string {
	return strings.Join(args, " ")
}

func resolveHostConnection(host Host, defaults HostDefaults) hostConnection {
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

	return hostConnection{
		target:   host.Host,
		user:     user,
		port:     port,
		identity: identity,
	}
}

func (c hostConnection) targetSpec() string {
	if c.user == "" {
		return c.target
	}
	return fmt.Sprintf("%s@%s", c.user, c.target)
}

func (c hostConnection) jumpSpec() string {
	spec := c.targetSpec()
	if c.port != 0 && c.port != 22 {
		spec = fmt.Sprintf("%s:%d", spec, c.port)
	}
	return spec
}

func buildNestedProxyCommand(hops []hostConnection) string {
	last := hops[len(hops)-1]
	args := []string{"ssh"}
	if last.identity != "" {
		args = append(args, "-i", last.identity)
	}
	if last.port != 0 && last.port != 22 {
		args = append(args, "-p", fmt.Sprintf("%d", last.port))
	}
	if len(hops) > 1 {
		args = append(args, "-o", fmt.Sprintf("ProxyCommand=%s", shellQuote(buildNestedProxyCommand(hops[:len(hops)-1]))))
	}
	args = append(args, "-W", "%h:%p", last.targetSpec())
	return joinArgs(args)
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}
