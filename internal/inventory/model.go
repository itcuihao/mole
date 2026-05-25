package inventory

// HostDefaults are applied when a host field is empty.
type HostDefaults struct {
	User         string `json:"user"`
	Port         int    `json:"port"`
	IdentityFile string `json:"identity_file"`
}

// Host represents a single SSH target.
type Host struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	SourceAlias  string   `json:"source_alias,omitempty"`
	Host         string   `json:"host"`
	User         string   `json:"user"`
	Port         int      `json:"port"`
	BastionID         string   `json:"bastion_id"`
	JumpHostIDs       []string `json:"jump_host_ids,omitempty"`
	IdentityFile      string   `json:"identity_file"`
	Tags              []string `json:"tags"`
	PortForwards      []string `json:"port_forwards,omitempty"`
	EnableHealthCheck bool     `json:"enable_health_check,omitempty"`
	EnableAlerts      bool     `json:"enable_alerts,omitempty"`
}

// HostGroup represents a named collection of hosts.
type HostGroup struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	BastionID string   `json:"bastion_id,omitempty"`
	HostIDs   []string `json:"host_ids"`
	Tags      []string `json:"tags"`
}

// Inventory is the root object stored in hosts.json.
type Inventory struct {
	Version  int          `json:"version"`
	Defaults HostDefaults `json:"defaults"`
	Hosts    []Host       `json:"hosts"`
	Groups   []HostGroup  `json:"groups"`
}

// DefaultInventory returns an initialized inventory.
func DefaultInventory() Inventory {
	return Inventory{
		Version: 1,
		Defaults: HostDefaults{
			User:         "",
			Port:         22,
			IdentityFile: "",
		},
		Hosts:  []Host{},
		Groups: []HostGroup{},
	}
}
