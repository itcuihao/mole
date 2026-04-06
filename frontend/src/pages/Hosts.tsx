import { useEffect, useMemo, useState } from 'react'
import { GetInventory, SaveInventory, SaveInventoryDefaults, SaveHost, DeleteHost, SaveHostGroup, DeleteHostGroup } from '../../wailsjs/go/main/App'
import { inventory } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Copy, Upload, Download, X, Server } from "lucide-react"

const EMPTY_INVENTORY = inventory.Inventory.createFrom({
  version: 1,
  defaults: { user: '', port: 22, identity_file: '' },
  hosts: [],
  groups: [],
})

function Hosts() {
  const [inv, setInv] = useState<inventory.Inventory>(EMPTY_INVENTORY)
  const [defaultsForm, setDefaultsForm] = useState({ user: '', port: '22', identity_file: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [showHostModal, setShowHostModal] = useState(false)
  const [editingHost, setEditingHost] = useState<inventory.Host | null>(null)
  const [hostForm, setHostForm] = useState({
    id: '',
    name: '',
    host: '',
    user: '',
    port: '',
    bastion_id: '',
    identity_file: '',
    tags: '',
  })

  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<inventory.HostGroup | null>(null)
  const [groupForm, setGroupForm] = useState({
    id: '',
    name: '',
    host_ids: '',
    tags: '',
  })

  const [showImportModal, setShowImportModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [jsonBuffer, setJsonBuffer] = useState('')

  const hostMap = useMemo(() => {
    const map = new Map<string, inventory.Host>()
    inv.hosts.forEach(h => map.set(h.id, h))
    return map
  }, [inv.hosts])

  useEffect(() => {
    loadInventory()
  }, [])

  const loadInventory = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await GetInventory()
      const next = data || EMPTY_INVENTORY
      setInv(next)
      setDefaultsForm({
        user: next.defaults?.user || '',
        port: String(next.defaults?.port || 22),
        identity_file: next.defaults?.identity_file || '',
      })
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const parseTags = (input: string) => input.split(',').map(t => t.trim()).filter(Boolean)
  const parseHostIDs = (input: string) => input.split(/\r?\n/).map(t => t.trim()).filter(Boolean)

  const openHostModal = (host?: inventory.Host) => {
    if (host) {
      setEditingHost(host)
      setHostForm({
        id: host.id,
        name: host.name || '',
        host: host.host || '',
        user: host.user || '',
        port: host.port ? String(host.port) : '',
        bastion_id: host.bastion_id || '',
        identity_file: host.identity_file || '',
        tags: (host.tags || []).join(', '),
      })
    } else {
      setEditingHost(null)
      setHostForm({
        id: '',
        name: '',
        host: '',
        user: '',
        port: '',
        bastion_id: '',
        identity_file: '',
        tags: '',
      })
    }
    setShowHostModal(true)
  }

  const openGroupModal = (group?: inventory.HostGroup) => {
    if (group) {
      setEditingGroup(group)
      setGroupForm({
        id: group.id,
        name: group.name || '',
        host_ids: (group.host_ids || []).join('\n'),
        tags: (group.tags || []).join(', '),
      })
    } else {
      setEditingGroup(null)
      setGroupForm({
        id: '',
        name: '',
        host_ids: '',
        tags: '',
      })
    }
    setShowGroupModal(true)
  }

  const saveDefaults = async () => {
    setMessage('')
    setError('')
    const parsedPort = parseInt(defaultsForm.port, 10)
    const port = Number.isNaN(parsedPort) ? 22 : parsedPort
    try {
      await SaveInventoryDefaults({
        user: defaultsForm.user.trim(),
        port,
        identity_file: defaultsForm.identity_file.trim(),
      })
      await loadInventory()
      setMessage('Defaults updated')
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setError(String(err))
    }
  }

  const handleSaveHost = async () => {
    if (!hostForm.host.trim()) {
      setError('Host address is required')
      return
    }
    setError('')
    const parsedPort = hostForm.port ? parseInt(hostForm.port, 10) : 0
    const port = Number.isNaN(parsedPort) ? 0 : parsedPort
    try {
      await SaveHost({
        id: hostForm.id,
        name: hostForm.name.trim(),
        host: hostForm.host.trim(),
        user: hostForm.user.trim(),
        port,
        bastion_id: hostForm.bastion_id || '',
        identity_file: hostForm.identity_file.trim(),
        tags: parseTags(hostForm.tags),
      })
      setShowHostModal(false)
      await loadInventory()
    } catch (err) {
      setError(String(err))
    }
  }

  const handleDeleteHost = async (id: string) => {
    try {
      await DeleteHost(id)
      await loadInventory()
    } catch (err) {
      setError(String(err))
    }
  }

  const handleSaveGroup = async () => {
    if (!groupForm.name.trim()) {
      setError('Group name is required')
      return
    }
    setError('')
    try {
      await SaveHostGroup({
        id: groupForm.id,
        name: groupForm.name.trim(),
        host_ids: parseHostIDs(groupForm.host_ids),
        tags: parseTags(groupForm.tags),
      })
      setShowGroupModal(false)
      await loadInventory()
    } catch (err) {
      setError(String(err))
    }
  }

  const handleDeleteGroup = async (id: string) => {
    try {
      await DeleteHostGroup(id)
      await loadInventory()
    } catch (err) {
      setError(String(err))
    }
  }

  const exportJson = () => {
    setJsonBuffer(JSON.stringify(inv, null, 2))
    setShowExportModal(true)
  }

  const importJson = async () => {
    setError('')
    try {
      const parsed = JSON.parse(jsonBuffer)
      await SaveInventory(parsed)
      setShowImportModal(false)
      await loadInventory()
    } catch (err) {
      setError(`Import failed: ${String(err)}`)
    }
  }

  const buildSSHCommand = (host: inventory.Host) => {
    if (!host.host) return ''
    const defaults = inv.defaults || { user: '', port: 22, identity_file: '' }
    const user = host.user || defaults.user
    const port = host.port || defaults.port
    const identity = host.identity_file || defaults.identity_file
    const bastion = host.bastion_id ? hostMap.get(host.bastion_id) : null

    const parts = ['ssh']
    if (identity) {
      parts.push('-i', identity)
    }
    if (port && port !== 22) {
      parts.push('-p', String(port))
    }
    if (bastion && bastion.host) {
      const bastionUser = bastion.user || defaults.user
      const bastionTarget = `${bastionUser ? `${bastionUser}@` : ''}${bastion.host}`
      parts.push('-J', bastionTarget)
    }
    parts.push(`${user ? `${user}@` : ''}${host.host}`)
    return parts.join(' ')
  }

  const copyCommand = async (host: inventory.Host) => {
    const cmd = buildSSHCommand(host)
    if (!cmd) return
    try {
      await navigator.clipboard.writeText(cmd)
      setMessage('SSH command copied')
      setTimeout(() => setMessage(''), 2500)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-foreground">Hosts</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => { setJsonBuffer(''); setShowImportModal(true) }} variant="secondary" size="sm">
            <Upload className="w-4 h-4" />
            Import JSON
          </Button>
          <Button onClick={exportJson} variant="secondary" size="sm">
            <Download className="w-4 h-4" />
            Export JSON
          </Button>
          <Button onClick={() => openGroupModal()} variant="secondary" size="sm">
            <Plus className="w-4 h-4" />
            Add Group
          </Button>
          <Button onClick={() => openHostModal()} size="sm">
            <Plus className="w-4 h-4" />
            Add Host
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/50 rounded text-destructive text-sm flex items-start justify-between gap-2">
          <span className="flex-1">{error}</span>
          <Button onClick={() => setError('')} variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-destructive/20">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {message && (
        <div className="mb-4 p-3 bg-primary/10 border border-primary/30 rounded text-foreground text-sm">
          {message}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Defaults</CardTitle>
          <CardDescription>Applied when a host leaves a field empty.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">User</label>
              <Input
                value={defaultsForm.user}
                onChange={e => setDefaultsForm({ ...defaultsForm, user: e.target.value })}
                placeholder="deploy"
                className="bg-muted/30 focus:bg-background"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Port</label>
              <Input
                value={defaultsForm.port}
                onChange={e => setDefaultsForm({ ...defaultsForm, port: e.target.value })}
                placeholder="22"
                className="bg-muted/30 focus:bg-background"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Identity File</label>
              <Input
                value={defaultsForm.identity_file}
                onChange={e => setDefaultsForm({ ...defaultsForm, identity_file: e.target.value })}
                placeholder="~/.ssh/id_ed25519"
                className="bg-muted/30 focus:bg-background"
              />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={saveDefaults} size="sm">Save Defaults</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading inventory...</div>
        ) : inv.hosts.length === 0 ? (
          <div className="text-center text-muted-foreground py-10">
            No hosts yet. Add one to start building your inventory.
          </div>
        ) : (
          inv.hosts.map(host => {
            const bastion = host.bastion_id ? hostMap.get(host.bastion_id) : null
            const command = buildSSHCommand(host)
            return (
              <div key={host.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        {host.name || host.host || 'Untitled Host'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-1">
                      {(host.user || inv.defaults.user) ? `${host.user || inv.defaults.user}@` : ''}
                      {host.host}
                      {(host.port || inv.defaults.port) && (host.port || inv.defaults.port) !== 22 ? `:${host.port || inv.defaults.port}` : ''}
                    </div>
                    {bastion && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Bastion: {bastion.name || bastion.host}
                      </div>
                    )}
                    {(host.identity_file || inv.defaults.identity_file) && (
                      <div className="text-xs text-muted-foreground mt-1 font-mono">
                        Key: {host.identity_file || inv.defaults.identity_file}
                      </div>
                    )}
                    {host.tags && host.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {host.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => copyCommand(host)}
                      variant="secondary"
                      size="sm"
                      disabled={!command}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy SSH
                    </Button>
                    <Button onClick={() => openHostModal(host)} variant="ghost" size="sm">
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button onClick={() => handleDeleteHost(host.id)} variant="destructive" size="sm">
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-foreground mb-3">Groups</h2>
        {inv.groups.length === 0 ? (
          <div className="text-sm text-muted-foreground">No groups yet. Create one to organize hosts.</div>
        ) : (
          <div className="grid gap-3">
            {inv.groups.map(group => (
              <div key={group.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">{group.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {group.host_ids.length} hosts
                    </div>
                    {group.host_ids.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {group.host_ids.map(id => (
                          <Badge key={id} variant="secondary" className="text-[10px]">
                            {hostMap.get(id)?.name || hostMap.get(id)?.host || id}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => openGroupModal(group)} variant="ghost" size="sm">
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button onClick={() => handleDeleteGroup(group.id)} variant="destructive" size="sm">
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showHostModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-0 w-[560px] max-w-[92vw] shadow-lg">
            <div className="px-6 py-4 border-b border-border/70 bg-muted/30">
              <h2 className="text-base font-semibold text-foreground">
                {editingHost ? 'Edit Host' : 'Add Host'}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Define how Mole connects to this machine. Leave fields empty to use Defaults.
              </p>
            </div>

            <div className="px-6 py-5 grid gap-5">
              <div className="grid gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Connection
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Name</label>
                  <Input
                    value={hostForm.name}
                    onChange={e => setHostForm({ ...hostForm, name: e.target.value })}
                    placeholder="Prod App 1"
                    className="bg-muted/30 focus:bg-background"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Host Address</label>
                  <Input
                    value={hostForm.host}
                    onChange={e => setHostForm({ ...hostForm, host: e.target.value })}
                    placeholder="10.0.2.10"
                    className="bg-muted/30 focus:bg-background"
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Access
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">User</label>
                    <Input
                      value={hostForm.user}
                      onChange={e => setHostForm({ ...hostForm, user: e.target.value })}
                      placeholder={inv.defaults.user || 'deploy'}
                      className="bg-muted/30 focus:bg-background"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Port</label>
                    <Input
                      value={hostForm.port}
                      onChange={e => setHostForm({ ...hostForm, port: e.target.value })}
                      placeholder={String(inv.defaults.port || 22)}
                      className="bg-muted/30 focus:bg-background"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Identity File</label>
                  <Input
                    value={hostForm.identity_file}
                    onChange={e => setHostForm({ ...hostForm, identity_file: e.target.value })}
                    placeholder={inv.defaults.identity_file || '~/.ssh/id_ed25519'}
                    className="bg-muted/30 focus:bg-background"
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Routing & Tags
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Bastion Host</label>
                  <Select
                    value={hostForm.bastion_id || 'none'}
                    onValueChange={value => setHostForm({ ...hostForm, bastion_id: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger className="bg-muted/30 focus:bg-background">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {inv.hosts
                        .filter(h => h.id !== hostForm.id)
                        .map(h => (
                          <SelectItem key={h.id} value={h.id}>
                            {h.name || h.host}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Tags</label>
                  <Input
                    value={hostForm.tags}
                    onChange={e => setHostForm({ ...hostForm, tags: e.target.value })}
                    placeholder="prod, app, db"
                    className="bg-muted/30 focus:bg-background"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border/70 bg-muted/20 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowHostModal(false)}>Cancel</Button>
              <Button onClick={handleSaveHost}>{editingHost ? 'Save' : 'Add Host'}</Button>
            </div>
          </div>
        </div>
      )}

      {showGroupModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-0 w-[520px] max-w-[92vw] shadow-lg">
            <div className="px-6 py-4 border-b border-border/70 bg-muted/30">
              <h2 className="text-base font-semibold text-foreground">
                {editingGroup ? 'Edit Group' : 'Add Group'}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Groups help you launch or filter hosts together.
              </p>
            </div>
            <div className="px-6 py-5 grid gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Name</label>
                <Input
                  value={groupForm.name}
                  onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                  placeholder="Prod App Servers"
                  className="bg-muted/30 focus:bg-background"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Host IDs (one per line)</label>
                <Textarea
                  value={groupForm.host_ids}
                  onChange={e => setGroupForm({ ...groupForm, host_ids: e.target.value })}
                  placeholder={inv.hosts.map(h => h.id).slice(0, 4).join('\n') || 'host-id-1'}
                  rows={4}
                  className="bg-muted/30 focus:bg-background"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Tags</label>
                <Input
                  value={groupForm.tags}
                  onChange={e => setGroupForm({ ...groupForm, tags: e.target.value })}
                  placeholder="prod, app"
                  className="bg-muted/30 focus:bg-background"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border/70 bg-muted/20 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowGroupModal(false)}>Cancel</Button>
              <Button onClick={handleSaveGroup}>{editingGroup ? 'Save' : 'Add Group'}</Button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-0 w-[720px] max-w-[94vw] shadow-lg">
            <div className="px-6 py-4 border-b border-border/70 bg-muted/30">
              <h2 className="text-base font-semibold text-foreground">Export Inventory</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Copy this JSON to share or commit to your team repo.
              </p>
            </div>
            <div className="px-6 py-5">
              <Textarea value={jsonBuffer} readOnly rows={12} className="font-mono text-xs bg-muted/30 focus:bg-background" />
            </div>
            <div className="px-6 py-4 border-t border-border/70 bg-muted/20 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(jsonBuffer)}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy JSON
              </Button>
              <Button onClick={() => setShowExportModal(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border border-border p-0 w-[720px] max-w-[94vw] shadow-lg">
            <div className="px-6 py-4 border-b border-border/70 bg-muted/30">
              <h2 className="text-base font-semibold text-foreground">Import Inventory</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Paste JSON exported from another Mole workspace.
              </p>
            </div>
            <div className="px-6 py-5">
              <Textarea
                value={jsonBuffer}
                onChange={e => setJsonBuffer(e.target.value)}
                placeholder="Paste inventory JSON here"
                rows={12}
                className="font-mono text-xs bg-muted/30 focus:bg-background"
              />
            </div>
            <div className="px-6 py-4 border-t border-border/70 bg-muted/20 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowImportModal(false)}>Cancel</Button>
              <Button onClick={importJson}>Import</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Hosts
