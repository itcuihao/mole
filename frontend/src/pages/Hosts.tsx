import { useEffect, useMemo, useState } from 'react'
import { GetInventory, SaveInventory, SaveInventoryDefaults, SaveHost, DeleteHost, SaveHostGroup, DeleteHostGroup } from '../../wailsjs/go/main/App'
import { inventory } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ModalShell } from "@/components/ui/modal-shell"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Copy, Upload, Download, X, Server, ChevronDown, ChevronUp } from "lucide-react"

const EMPTY_INVENTORY = inventory.Inventory.createFrom({
  version: 1,
  defaults: { user: '', port: 22, identity_file: '' },
  hosts: [],
  groups: [],
})

type GroupModalSource = 'standalone' | 'host'

const hostSortLabel = (host: inventory.Host) => (host.name || host.host || '').trim()

const compareHostLabels = (left: inventory.Host, right: inventory.Host) => (
  hostSortLabel(left).localeCompare(hostSortLabel(right), undefined, { sensitivity: 'base', numeric: true })
)

function Hosts() {
  const [inv, setInv] = useState<inventory.Inventory>(EMPTY_INVENTORY)
  const [defaultsForm, setDefaultsForm] = useState({ user: '', port: '22', identity_file: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showDefaults, setShowDefaults] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

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
  const [hostGroupIds, setHostGroupIds] = useState<string[]>([])

  const [showGroupModal, setShowGroupModal] = useState(false)
  const [showGroupListModal, setShowGroupListModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<inventory.HostGroup | null>(null)
  const [groupModalSource, setGroupModalSource] = useState<GroupModalSource>('standalone')
  const [groupForm, setGroupForm] = useState({
    id: '',
    name: '',
    host_ids: [] as string[],
  })

  const [showImportModal, setShowImportModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [jsonBuffer, setJsonBuffer] = useState('')

  const hostMap = useMemo(() => {
    const map = new Map<string, inventory.Host>()
    inv.hosts.forEach(h => map.set(h.id, h))
    return map
  }, [inv.hosts])

  const sortedHosts = useMemo(() => (
    [...inv.hosts].sort(compareHostLabels)
  ), [inv.hosts])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    inv.hosts.forEach(host => {
      (host.tags || []).forEach(tag => tags.add(tag))
    })
    return Array.from(tags).sort()
  }, [inv.hosts])

  const filteredHosts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return sortedHosts.filter(host => {
      const tags = host.tags || []
      const matchesQuery = !query
        || (host.name || '').toLowerCase().includes(query)
        || (host.host || '').toLowerCase().includes(query)
        || tags.some(tag => tag.toLowerCase().includes(query))
      const matchesTags = selectedTags.length === 0
        || tags.some(tag => selectedTags.includes(tag))
      return matchesQuery && matchesTags
    })
  }, [search, selectedTags, sortedHosts])

  useEffect(() => {
    loadInventory()
  }, [])

  const showTransientMessage = (text: string, duration = 3000) => {
    setMessage(text)
    setTimeout(() => setMessage(''), duration)
  }

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
  const openHostModal = (host?: inventory.Host) => {
    if (host) {
      setEditingHost(host)
      const groupIds = inv.groups
        .filter(group => (group.host_ids || []).includes(host.id))
        .map(group => group.id)
      setHostGroupIds(groupIds)
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
      setHostGroupIds([])
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

  const openGroupModal = (group?: inventory.HostGroup, source: GroupModalSource = 'standalone') => {
    setGroupModalSource(source)
    if (group) {
      setEditingGroup(group)
      setGroupForm({
        id: group.id,
        name: group.name || '',
        host_ids: group.host_ids || [],
      })
    } else {
      setEditingGroup(null)
      setGroupForm({
        id: '',
        name: '',
        host_ids: [],
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
    const hostID = hostForm.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '')
    if (!hostID) {
      setError('Unable to generate host ID')
      return
    }
    try {
      await SaveHost({
        id: hostID,
        name: hostForm.name.trim(),
        host: hostForm.host.trim(),
        user: hostForm.user.trim(),
        port,
        bastion_id: hostForm.bastion_id || '',
        identity_file: hostForm.identity_file.trim(),
        tags: parseTags(hostForm.tags),
      })

      await Promise.all(inv.groups.map(group => {
        const shouldInclude = hostGroupIds.includes(group.id)
        const hasHost = (group.host_ids || []).includes(hostID)
        if (shouldInclude === hasHost) return Promise.resolve()
        const nextIDs = shouldInclude
          ? Array.from(new Set([...(group.host_ids || []), hostID]))
          : (group.host_ids || []).filter(id => id !== hostID)
        return SaveHostGroup({
          id: group.id,
          name: group.name,
          host_ids: nextIDs,
          tags: group.tags || [],
        })
      }))

      setShowHostModal(false)
      await loadInventory()
      showTransientMessage(editingHost ? 'Host updated' : 'Host added')
    } catch (err) {
      setError(String(err))
    }
  }

  const handleDeleteHost = async (id: string) => {
    try {
      await DeleteHost(id)
      await loadInventory()
      showTransientMessage('Host deleted')
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
      const groupID = groupForm.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '')
      if (!groupID) {
        setError('Unable to generate group ID')
        return
      }

      await SaveHostGroup({
        id: groupID,
        name: groupForm.name.trim(),
        host_ids: groupForm.host_ids,
        tags: [],
      })
      setShowGroupModal(false)
      await loadInventory()
      if (groupModalSource === 'host') {
        setHostGroupIds(prev => (prev.includes(groupID) ? prev : [...prev, groupID]))
        showTransientMessage(editingGroup ? 'Group updated. Your host draft is still open.' : 'Group created and selected for this host.')
      } else {
        showTransientMessage(editingGroup ? 'Group updated' : 'Group added')
      }
    } catch (err) {
      setError(String(err))
    }
  }

  const toggleGroupHost = (id: string) => {
    setGroupForm(prev => {
      const exists = prev.host_ids.includes(id)
      return {
        ...prev,
        host_ids: exists
          ? prev.host_ids.filter(hostID => hostID !== id)
          : [...prev.host_ids, id],
      }
    })
  }

  const toggleHostGroup = (groupID: string) => {
    setHostGroupIds(prev => (
      prev.includes(groupID)
        ? prev.filter(id => id !== groupID)
        : [...prev, groupID]
    ))
  }

  const groupsForHost = (hostID: string) => (
    inv.groups.filter(group => (group.host_ids || []).includes(hostID))
  )

  const handleDeleteGroup = async (id: string) => {
    try {
      await DeleteHostGroup(id)
      await loadInventory()
      setHostGroupIds(prev => prev.filter(groupID => groupID !== id))
      showTransientMessage('Group deleted')
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
      showTransientMessage('Inventory imported')
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

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev => (
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    ))
  }

  const clearFilters = () => {
    setSearch('')
    setSelectedTags([])
  }

  const toggleGroupByTag = (tag: string) => {
    const hostIDs = inv.hosts
      .filter(host => (host.tags || []).includes(tag))
      .map(host => host.id)

    if (hostIDs.length === 0) return

    setGroupForm(prev => {
      const hasAll = hostIDs.every(id => prev.host_ids.includes(id))
      return {
        ...prev,
        host_ids: hasAll
          ? prev.host_ids.filter(id => !hostIDs.includes(id))
          : Array.from(new Set([...prev.host_ids, ...hostIDs])),
      }
    })
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
          <Button onClick={() => setShowGroupListModal(true)} variant="secondary" size="sm">
            Manage Groups
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

      {inv.hosts.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, host, or tag..."
              className="bg-muted/30 focus:bg-background max-w-sm"
            />
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {allTags.map(tag => {
                  const active = selectedTags.includes(tag)
                  return (
                    <Button
                      key={tag}
                      onClick={() => toggleTagFilter(tag)}
                      variant="secondary"
                      size="sm"
                      className={active
                        ? 'h-7 px-2 bg-primary text-primary-foreground'
                        : 'h-7 px-2 bg-muted/30'}
                    >
                      {tag}
                    </Button>
                  )
                })}
              </div>
            )}
            {(search || selectedTags.length > 0) && (
              <Button onClick={clearFilters} variant="ghost" size="sm" className="h-7 px-2">
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      <Card className="mb-6">
        <button
          type="button"
          onClick={() => setShowDefaults(prev => !prev)}
          className="w-full text-left"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Defaults</CardTitle>
              <CardDescription>Applied when a host leaves a field empty.</CardDescription>
            </div>
            <span className="text-muted-foreground">
              {showDefaults ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </CardHeader>
        </button>
        {showDefaults && (
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
        )}
      </Card>

      <div className="grid gap-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading inventory...</div>
        ) : inv.hosts.length === 0 ? (
          <div className="text-center text-muted-foreground py-10">
            No hosts yet. Add one to start building your inventory.
          </div>
        ) : filteredHosts.length === 0 ? (
          <div className="text-center text-muted-foreground py-6">
            No hosts match the current filters.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredHosts.map(host => {
              const bastion = host.bastion_id ? hostMap.get(host.bastion_id) : null
              const command = buildSSHCommand(host)
              return (
                <div key={host.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex flex-col gap-3">
                    <div>
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
                  {groupsForHost(host.id).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {groupsForHost(host.id).map(group => (
                        <Badge key={group.id} variant="secondary" className="text-[10px]">
                          {group.name || 'Group'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                    <div className="flex flex-wrap items-center gap-2">
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
            })}
          </div>
        )}
      </div>

      {showHostModal && (
        <ModalShell
          title={editingHost ? 'Edit Host' : 'Add Host'}
          description="Define how Mole connects to this machine. Leave fields empty to use Defaults."
          onClose={() => setShowHostModal(false)}
          contentStyle={{ maxWidth: '560px' }}
          bodyClassName="grid gap-5"
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowHostModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveHost}>{editingHost ? 'Save' : 'Add Host'}</Button>
            </div>
          )}
        >
          <div className="grid gap-5">
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
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Groups
                  </div>
                  <Button
                    onClick={() => openGroupModal(undefined, 'host')}
                    variant="secondary"
                    size="sm"
                    className="h-7"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Group
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Groups are named collections used to organize and filter saved hosts. Creating one here keeps this host draft open.
                </p>
                {inv.groups.length === 0 ? (
                  <div className="text-xs text-muted-foreground bg-muted/20 border border-border rounded p-3 flex items-center justify-between gap-3">
                    <span>No groups yet. Create one without leaving this host.</span>
                    <Button
                      onClick={() => openGroupModal(undefined, 'host')}
                      variant="secondary"
                      size="sm"
                      className="h-7"
                    >
                      Add Group
                    </Button>
                  </div>
                ) : (
                  <div className="border border-border rounded bg-muted/20 max-h-48 overflow-auto">
                    {inv.groups.map(group => {
                      const checked = hostGroupIds.includes(group.id)
                      return (
                        <label
                          key={group.id}
                          className="flex items-center gap-2 px-3 py-2 text-xs text-foreground border-b border-border/50 last:border-b-0 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleHostGroup(group.id)}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          <span className="font-medium">{group.name || 'Group'}</span>
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            {(group.host_ids || []).length} hosts
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
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
        </ModalShell>
      )}

      {showGroupModal && (
        <ModalShell
          title={editingGroup ? 'Edit Group' : 'Add Group'}
          description="Groups are named host collections used for organization and filtering."
          onClose={() => setShowGroupModal(false)}
          overlayClassName={groupModalSource === 'host' ? 'z-[110]' : undefined}
          contentStyle={{ maxWidth: '520px' }}
          bodyClassName="grid gap-3"
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowGroupModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveGroup}>{editingGroup ? 'Save' : 'Add Group'}</Button>
            </div>
          )}
        >
          <div className="grid gap-3">
              {groupModalSource === 'host' && (
                <div className="rounded-md border border-primary/20 bg-primary/10 p-3 text-xs text-muted-foreground">
                  When you save this group, the host you are editing will stay open and this group will be selected automatically.
                </div>
              )}
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
                <label className="block text-xs text-muted-foreground mb-1">Hosts</label>
                {allTags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {allTags.map(tag => (
                      <Button
                        key={tag}
                        onClick={() => toggleGroupByTag(tag)}
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 bg-muted/30"
                      >
                        Toggle {tag}
                      </Button>
                    ))}
                  </div>
                )}
                {inv.hosts.length === 0 ? (
                  <div className="text-xs text-muted-foreground bg-muted/20 border border-border rounded p-3">
                    No hosts available. Create hosts first, then add them to this group.
                  </div>
                ) : (
                  <div className="border border-border rounded bg-muted/20 max-h-56 overflow-auto">
                    {sortedHosts.map(host => {
                      const checked = groupForm.host_ids.includes(host.id)
                      return (
                        <label
                          key={host.id}
                          className="flex items-center gap-2 px-3 py-2 text-xs text-foreground border-b border-border/50 last:border-b-0 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleGroupHost(host.id)}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          <span className="font-medium">{host.name || host.host}</span>
                          <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                            {host.host}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
          </div>
        </ModalShell>
      )}

      {showGroupListModal && (
        <ModalShell
          title="Groups"
          description="Review group membership and manage named host collections."
          onClose={() => setShowGroupListModal(false)}
          contentStyle={{ maxWidth: '720px' }}
          footer={(
            <div className="flex items-center justify-between gap-2">
              <Button
                onClick={() => { setShowGroupListModal(false); openGroupModal() }}
                variant="secondary"
              >
                <Plus className="w-4 h-4" />
                Add Group
              </Button>
              <Button onClick={() => setShowGroupListModal(false)} variant="ghost">
                Close
              </Button>
            </div>
          )}
        >
          <div>
              {inv.groups.length === 0 ? (
                <div className="text-sm text-muted-foreground">No groups yet. Create one to organize hosts.</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {inv.groups.map(group => (
                    <div key={group.id} className="bg-muted/20 border border-border rounded-lg p-4">
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
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          onClick={() => { setShowGroupListModal(false); openGroupModal(group) }}
                          variant="ghost"
                          size="sm"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </Button>
                        <Button onClick={() => handleDeleteGroup(group.id)} variant="destructive" size="sm">
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </ModalShell>
      )}

      {showExportModal && (
        <ModalShell
          title="Export Inventory"
          description="Copy this JSON to share or commit to your team repo."
          onClose={() => setShowExportModal(false)}
          contentStyle={{ maxWidth: '720px' }}
          footer={(
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(jsonBuffer)}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy JSON
              </Button>
              <Button onClick={() => setShowExportModal(false)}>Close</Button>
            </div>
          )}
        >
          <Textarea
            value={jsonBuffer}
            readOnly
            rows={12}
            className="font-mono text-xs bg-muted/30 focus:bg-background"
          />
        </ModalShell>
      )}

      {showImportModal && (
        <ModalShell
          title="Import Inventory"
          description="Paste JSON exported from another Mole workspace."
          onClose={() => setShowImportModal(false)}
          contentStyle={{ maxWidth: '720px' }}
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowImportModal(false)}>
                Cancel
              </Button>
              <Button onClick={importJson}>Import</Button>
            </div>
          )}
        >
          <Textarea
            value={jsonBuffer}
            onChange={e => setJsonBuffer(e.target.value)}
            placeholder="Paste inventory JSON here"
            rows={12}
            className="font-mono text-xs bg-muted/30 focus:bg-background"
          />
        </ModalShell>
      )}
    </div>
  )
}

export default Hosts
