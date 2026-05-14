import { useEffect, useMemo, useState } from 'react'
import { GetInventory, SaveInventoryDefaults, SaveHost, DeleteHost, SaveHostGroup, DeleteHostGroup, PreviewSSHConfigImport, ImportSSHConfig } from '../../wailsjs/go/main/App'
import { ClipboardSetText } from '../../wailsjs/runtime/runtime'
import { inventory } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ModalShell } from "@/components/ui/modal-shell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useTranslation } from "@/i18n/context"
import { Plus, Pencil, Trash2, Copy, X, Server, ChevronDown, ChevronUp, ArrowLeft, Search } from "lucide-react"

const EMPTY_INVENTORY = inventory.Inventory.createFrom({
  version: 1,
  defaults: { user: '', port: 22, identity_file: '' },
  hosts: [],
  groups: [],
})

type GroupModalSource = 'standalone' | 'host'
type HostRecord = inventory.Host & {
  source_alias?: string
  jump_host_ids?: string[]
}
type InventoryState = inventory.Inventory & {
  hosts: HostRecord[]
}
type SSHConfigImportCandidate = {
  alias: string
  name: string
  host: string
  user?: string
  port?: number
  identity_file?: string
  jump_aliases?: string[]
  importable: boolean
  blocked_reason?: string
  conflict_kind?: string
  conflict_host_id?: string
  conflict_host_name?: string
  warnings?: string[]
}
type SSHConfigImportPreviewState = {
  path: string
  candidates: SSHConfigImportCandidate[]
}

const hostSortLabel = (host: HostRecord) => (host.name || host.host || '').trim()

const compareHostLabels = (left: HostRecord, right: HostRecord) => (
  hostSortLabel(left).localeCompare(hostSortLabel(right), undefined, { sensitivity: 'base', numeric: true })
)

const hostJumpChain = (host?: HostRecord | null) => (
  (host?.jump_host_ids || []).filter(Boolean).length > 0
    ? (host?.jump_host_ids || []).filter(Boolean)
    : (host?.bastion_id ? [host.bastion_id] : [])
)

type HostConnection = {
  target: string
  user: string
  port: number
  identity: string
}

const resolveHostConnection = (host: HostRecord, defaults: inventory.HostDefaults): HostConnection => ({
  target: host.host || '',
  user: host.user || defaults.user || '',
  port: host.port || defaults.port || 22,
  identity: host.identity_file || defaults.identity_file || '',
})

const targetSpec = (conn: HostConnection) => (
  conn.user ? `${conn.user}@${conn.target}` : conn.target
)

const jumpSpec = (conn: HostConnection) => (
  conn.port && conn.port !== 22 ? `${targetSpec(conn)}:${conn.port}` : targetSpec(conn)
)

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\"'\"'`)}'`

const joinArgs = (args: string[]) => args.filter(Boolean).join(' ')

const buildNestedProxyCommand = (hops: HostConnection[]): string => {
  const last = hops[hops.length - 1]
  const args = ['ssh']
  if (last.identity) args.push('-i', last.identity)
  if (last.port && last.port !== 22) args.push('-p', String(last.port))
  if (hops.length > 1) {
    args.push('-o', `ProxyCommand=${shellQuote(buildNestedProxyCommand(hops.slice(0, -1)))}`)
  }
  args.push('-W', '%h:%p', targetSpec(last))
  return joinArgs(args)
}

function Hosts({
  refreshSignal,
  onCreated,
  onBack,
}: {
  refreshSignal?: number
  onCreated?: () => void
  onBack?: () => void
}) {
  const { t } = useTranslation()
  const [inv, setInv] = useState<InventoryState>(EMPTY_INVENTORY as InventoryState)
  const [defaultsForm, setDefaultsForm] = useState({ user: '', port: '22', identity_file: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showDefaults, setShowDefaults] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const [showHostModal, setShowHostModal] = useState(false)
  const [editingHost, setEditingHost] = useState<HostRecord | null>(null)
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
  const [showSSHImportModal, setShowSSHImportModal] = useState(false)
  const [sshImportPath, setSSHImportPath] = useState('~/.ssh/config')
  const [sshImportBusy, setSSHImportBusy] = useState<'preview' | 'import' | null>(null)
  const [sshPreview, setSSHPreview] = useState<SSHConfigImportPreviewState | null>(null)
  const [sshSelectedAliases, setSSHSelectedAliases] = useState<string[]>([])
  const [sshConflictStrategy, setSSHConflictStrategy] = useState<'skip' | 'overwrite'>('skip')
  const [groupForm, setGroupForm] = useState({
    id: '',
    name: '',
    host_ids: [] as string[],
  })

  const hostMap = useMemo(() => {
    const map = new Map<string, HostRecord>()
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
  }, [refreshSignal])

  const showTransientMessage = (text: string, duration = 3000) => {
    setMessage(text)
    setTimeout(() => setMessage(''), duration)
  }

  const loadInventory = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await GetInventory() as InventoryState | null
      const next = (data || EMPTY_INVENTORY) as InventoryState
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
  const openHostModal = (host?: HostRecord) => {
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
      setMessage(t('hosts.defaults.updated'))
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setError(String(err))
    }
  }

  const handleSaveHost = async () => {
    if (!hostForm.host.trim()) {
      setError(t('hosts.form.hostRequired'))
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
      const originalBastionID = editingHost?.bastion_id || ''
      const originalJumpChain = hostJumpChain(editingHost)
      const nextJumpChain = (() => {
        if (editingHost && hostForm.bastion_id === originalBastionID && originalJumpChain.length > 1) {
          return originalJumpChain
        }
        return hostForm.bastion_id ? [hostForm.bastion_id] : []
      })()

      await SaveHost({
        id: hostID,
        name: hostForm.name.trim(),
        source_alias: editingHost?.source_alias || '',
        host: hostForm.host.trim(),
        user: hostForm.user.trim(),
        port,
        bastion_id: hostForm.bastion_id || '',
        jump_host_ids: nextJumpChain,
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
      showTransientMessage(editingHost ? t('hosts.msg.hostUpdated') : t('hosts.msg.hostAdded'))
      if (!editingHost) onCreated?.()
    } catch (err) {
      setError(String(err))
    }
  }

  const handleDeleteHost = async (id: string) => {
    try {
      await DeleteHost(id)
      await loadInventory()
      showTransientMessage(t('hosts.msg.hostDeleted'))
    } catch (err) {
      setError(String(err))
    }
  }

  const handleSaveGroup = async () => {
    if (!groupForm.name.trim()) {
      setError(t('hosts.group.nameRequired'))
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
        showTransientMessage(editingGroup ? t('hosts.msg.groupUpdatedDraft') : t('hosts.msg.groupCreatedSelected'))
      } else {
        showTransientMessage(editingGroup ? t('hosts.msg.groupUpdated') : t('hosts.msg.groupAdded'))
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
      showTransientMessage(t('hosts.msg.groupDeleted'))
    } catch (err) {
      setError(String(err))
    }
  }

  const buildSSHCommand = (host: HostRecord) => {
    if (!host.host) return ''
    const defaults = inv.defaults || { user: '', port: 22, identity_file: '' }
    const targetConn = resolveHostConnection(host, defaults)
    const parts = ['ssh']
    if (targetConn.identity) {
      parts.push('-i', targetConn.identity)
    }
    if (targetConn.port && targetConn.port !== 22) {
      parts.push('-p', String(targetConn.port))
    }

    const chainIDs = hostJumpChain(host)
    if (chainIDs.length > 0) {
      const hops = chainIDs
        .map(id => hostMap.get(id))
        .filter((item): item is HostRecord => Boolean(item?.host))
        .map(item => resolveHostConnection(item, defaults))

      if (hops.length > 0) {
        const canUseProxyJump = hops.every(hop => !hop.identity)
        if (canUseProxyJump) {
          parts.push('-J', hops.map(jumpSpec).join(','))
        } else {
          parts.push('-o', `ProxyCommand=${shellQuote(buildNestedProxyCommand(hops))}`)
        }
      }
    }

    parts.push(targetSpec(targetConn))
    return joinArgs(parts)
  }

  const copyCommand = async (host: HostRecord) => {
    const cmd = buildSSHCommand(host)
    if (!cmd) return
    try {
      await ClipboardSetText(cmd)
      setMessage(t('hosts.msg.sshCopied'))
      setTimeout(() => setMessage(''), 2500)
    } catch (err) {
      setError(String(err))
    }
  }

  const handleDuplicateHost = (host: HostRecord) => {
    setEditingHost(null)
    setHostForm({
      id: '',
      name: `${host.name || host.host || ''} (copy)`,
      host: host.host || '',
      user: host.user || '',
      port: host.port ? String(host.port) : '',
      bastion_id: host.bastion_id || '',
      identity_file: host.identity_file || '',
      tags: (host.tags || []).join(', '),
    })
    setHostGroupIds(
      inv.groups
        .filter(g => (g.host_ids || []).includes(host.id))
        .map(g => g.id)
    )
    setShowHostModal(true)
  }

  const handlePreviewSSHConfig = async () => {
    setError('')
    setMessage('')
    setSSHImportBusy('preview')
    try {
      const preview = await PreviewSSHConfigImport(sshImportPath) as SSHConfigImportPreviewState
      setSSHPreview(preview)
      setSSHSelectedAliases(preview.candidates.filter(candidate => candidate.importable).map(candidate => candidate.alias))
    } catch (err) {
      setError(String(err))
    } finally {
      setSSHImportBusy(null)
    }
  }

  const toggleSSHAlias = (alias: string) => {
    setSSHSelectedAliases(prev => (
      prev.includes(alias)
        ? prev.filter(item => item !== alias)
        : [...prev, alias]
    ))
  }

  const handleImportSSHConfig = async () => {
    if (!sshPreview) return
    setError('')
    setMessage('')
    setSSHImportBusy('import')
    try {
      await ImportSSHConfig({
        path: sshPreview.path,
        aliases: sshSelectedAliases,
        conflict_strategy: sshConflictStrategy,
      })
      await loadInventory()
      setShowSSHImportModal(false)
      setSSHPreview(null)
      setSSHSelectedAliases([])
      setMessage(t('hosts.import.success'))
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setError(String(err))
    } finally {
      setSSHImportBusy(null)
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
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="surface-panel rounded-2xl border border-border px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {onBack && (
                <Button onClick={onBack} variant="ghost" size="sm" className="h-8 w-8 rounded-xl p-0">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <h1 className="text-xl font-semibold text-foreground">{t('hosts.title')}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setShowSSHImportModal(true)} variant="outline" size="sm">
              {t('hosts.import.button')}
            </Button>
            <Button onClick={() => setShowGroupListModal(true)} variant="secondary" size="sm">
              {t('hosts.manageGroups')}
            </Button>
            <Button onClick={() => openHostModal()} size="sm" className="shadow-sm">
              <Plus className="w-4 h-4" />
              {t('hosts.addHost')}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('hosts.searchPlaceholder')}
                className="h-10 rounded-xl border-border bg-background/80 pl-10 pr-10"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t('common.clear')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('hosts.summary', { filtered: filteredHosts.length, total: inv.hosts.length })}
            </div>
          </div>

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
                    aria-pressed={active}
                    className={active
                      ? 'interactive-chip h-8 rounded-full border-primary bg-primary/10 px-3 text-primary'
                      : 'interactive-chip h-8 rounded-full border-border bg-background px-3 text-muted-foreground hover:border-primary/30 hover:text-foreground'}
                  >
                    {tag}
                  </Button>
                )
              })}
              {(search || selectedTags.length > 0) && (
                <Button onClick={clearFilters} variant="ghost" size="sm" className="h-8 rounded-full px-3">
                  {t('common.clear')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="surface-panel flex items-start justify-between gap-2 rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <Button onClick={() => setError('')} variant="ghost" size="sm" className="h-6 w-6 rounded-full p-0 hover:bg-destructive/20">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {message && (
        <div className="surface-panel rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      )}

      <Card>
        <button
          type="button"
          onClick={() => setShowDefaults(prev => !prev)}
          className="w-full text-left"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">{t('hosts.defaults.title')}</CardTitle>
              <CardDescription>{t('hosts.defaults.desc')}</CardDescription>
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
                <label className="block text-xs text-muted-foreground mb-1">{t('hosts.defaults.user')}</label>
                <Input
                  value={defaultsForm.user}
                  onChange={e => setDefaultsForm({ ...defaultsForm, user: e.target.value })}
                  placeholder="deploy"
                  className="bg-muted/30 focus:bg-background"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t('hosts.defaults.port')}</label>
                <Input
                  value={defaultsForm.port}
                  onChange={e => setDefaultsForm({ ...defaultsForm, port: e.target.value })}
                  placeholder="22"
                  className="bg-muted/30 focus:bg-background"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t('hosts.defaults.identityFile')}</label>
                <Input
                  value={defaultsForm.identity_file}
                  onChange={e => setDefaultsForm({ ...defaultsForm, identity_file: e.target.value })}
                  placeholder="~/.ssh/id_ed25519"
                  className="bg-muted/30 focus:bg-background"
                />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={saveDefaults} size="sm">{t('hosts.defaults.save')}</Button>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="app-scroll min-h-0 flex-1 overflow-auto pr-1">
        {loading ? (
          <div className="surface-panel rounded-2xl border border-border bg-muted/15 px-6 py-10 text-sm text-muted-foreground">{t('hosts.loading')}</div>
        ) : inv.hosts.length === 0 ? (
          <div className="surface-panel rounded-2xl border border-border bg-muted/15 px-6 py-12 text-center text-muted-foreground">
            {t('hosts.empty')}
          </div>
        ) : filteredHosts.length === 0 ? (
          <div className="surface-panel rounded-2xl border border-border bg-muted/15 px-6 py-12 text-center text-muted-foreground">
            {t('hosts.noFilterMatch')}
          </div>
        ) : (
          <div className="grid gap-3 pb-2 sm:grid-cols-2 xl:grid-cols-3">
            {filteredHosts.map(host => {
              const bastion = host.bastion_id ? hostMap.get(host.bastion_id) : null
              const jumpChain = hostJumpChain(host)
              const command = buildSSHCommand(host)
              return (
                <div key={host.id} className="breathing-card surface-panel flex flex-col rounded-2xl border border-border bg-card p-4 transition-all">
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate text-sm font-medium text-foreground">
                          {host.name || host.host || t('hosts.untitled')}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-1">
                        {(host.user || inv.defaults.user) ? `${host.user || inv.defaults.user}@` : ''}
                        {host.host}
                        {(host.port || inv.defaults.port) && (host.port || inv.defaults.port) !== 22 ? `:${host.port || inv.defaults.port}` : ''}
                      </div>
                      {bastion && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {t('hosts.bastion', { name: bastion.name || bastion.host })}
                        </div>
                      )}
                      {host.source_alias && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t('hosts.sourceAlias', { alias: host.source_alias })}
                        </div>
                      )}
                      {jumpChain.length > 1 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t('hosts.jumpChain', {
                            chain: jumpChain
                              .map(id => hostMap.get(id)?.name || hostMap.get(id)?.host || id)
                              .join(' -> '),
                          })}
                        </div>
                      )}
                      {(host.identity_file || inv.defaults.identity_file) && (
                        <div className="text-xs text-muted-foreground mt-1 font-mono">
                          {t('hosts.key', { path: host.identity_file || inv.defaults.identity_file })}
                        </div>
                      )}
                  {host.tags && host.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {host.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="rounded-full border border-border/80 bg-muted/30 text-[10px] text-muted-foreground">{tag}</Badge>
                      ))}
                    </div>
                  )}
                  {groupsForHost(host.id).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {groupsForHost(host.id).map(group => (
                        <Badge key={group.id} variant="secondary" className="rounded-full border border-primary/20 bg-primary/10 text-[10px] text-primary">
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
                        className="shadow-sm"
                        disabled={!command}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {t('hosts.copySSH')}
                      </Button>
                      <Button onClick={() => openHostModal(host)} variant="ghost" size="sm">
                        <Pencil className="w-3.5 h-3.5" />
                        {t('common.edit')}
                      </Button>
                      <Button onClick={() => handleDuplicateHost(host)} variant="ghost" size="sm">
                        <Copy className="w-3.5 h-3.5" />
                        {t('common.duplicate')}
                      </Button>
                      <Button onClick={() => handleDeleteHost(host.id)} variant="destructive" size="sm">
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showSSHImportModal && (
        <ModalShell
          title={t('hosts.import.title')}
          description={t('hosts.import.desc')}
          onClose={() => setShowSSHImportModal(false)}
          contentStyle={{ maxWidth: '780px' }}
          footer={(
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {t('hosts.import.selectedCount', { count: sshSelectedAliases.length })}
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => setShowSSHImportModal(false)} variant="ghost">
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleImportSSHConfig}
                  disabled={sshImportBusy === 'import' || sshSelectedAliases.length === 0 || !sshPreview}
                >
                  {sshImportBusy === 'import' ? t('hosts.import.importing') : t('hosts.import.confirm')}
                </Button>
              </div>
            </div>
          )}
        >
          <div className="grid gap-4">
            <div className="grid gap-3 rounded-xl border border-border bg-muted/10 p-4">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t('hosts.import.path')}</label>
                <Input
                  value={sshImportPath}
                  onChange={e => setSSHImportPath(e.target.value)}
                  placeholder="~/.ssh/config"
                  className="bg-background/80"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t('hosts.import.conflictStrategy')}</label>
                  <Select value={sshConflictStrategy} onValueChange={value => setSSHConflictStrategy(value as 'skip' | 'overwrite')}>
                    <SelectTrigger className="w-44 bg-background/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">{t('hosts.import.skip')}</SelectItem>
                      <SelectItem value="overwrite">{t('hosts.import.overwrite')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handlePreviewSSHConfig} variant="secondary" disabled={sshImportBusy === 'preview'}>
                  {sshImportBusy === 'preview' ? t('hosts.import.previewing') : t('hosts.import.preview')}
                </Button>
              </div>
            </div>

            {!sshPreview ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                {t('hosts.import.empty')}
              </div>
            ) : (
              <div className="app-scroll max-h-[26rem] space-y-3 overflow-y-auto pr-1">
                {sshPreview.candidates.map(candidate => {
                  const selected = sshSelectedAliases.includes(candidate.alias)
                  const conflictTone = candidate.conflict_kind === 'alias'
                    ? 'border-primary/25 bg-primary/5'
                    : candidate.conflict_kind === 'name'
                      ? 'border-warning/30 bg-warning/10'
                      : 'border-border bg-card/70'
                  return (
                    <label
                      key={candidate.alias}
                      className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${candidate.importable ? conflictTone : 'border-destructive/30 bg-destructive/5'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!candidate.importable}
                        onChange={() => toggleSSHAlias(candidate.alias)}
                        className="mt-1 h-4 w-4 rounded accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{candidate.alias}</span>
                          {candidate.conflict_kind === 'alias' && (
                            <Badge variant="secondary" className="rounded-full border border-primary/20 bg-primary/10 text-[10px] text-primary">
                              {t('hosts.import.aliasConflict')}
                            </Badge>
                          )}
                          {candidate.conflict_kind === 'name' && (
                            <Badge variant="secondary" className="rounded-full border border-warning/30 bg-warning/10 text-[10px] text-warning-foreground">
                              {t('hosts.import.nameConflict')}
                            </Badge>
                          )}
                          {!candidate.importable && (
                            <Badge variant="secondary" className="rounded-full border border-destructive/30 bg-destructive/10 text-[10px] text-destructive">
                              {t('hosts.import.blocked')}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 text-xs font-mono text-muted-foreground">
                          {(candidate.user ? `${candidate.user}@` : '')}
                          {candidate.host}
                          {candidate.port && candidate.port !== 22 ? `:${candidate.port}` : ''}
                        </div>
                        {candidate.identity_file && (
                          <div className="mt-1 text-xs text-muted-foreground">{t('hosts.key', { path: candidate.identity_file })}</div>
                        )}
                        {candidate.jump_aliases && candidate.jump_aliases.length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t('hosts.jumpChain', { chain: candidate.jump_aliases.join(' -> ') })}
                          </div>
                        )}
                        {candidate.conflict_host_name && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t('hosts.import.conflictWith', { name: candidate.conflict_host_name })}
                          </div>
                        )}
                        {candidate.blocked_reason && (
                          <div className="mt-1 text-xs text-destructive">{candidate.blocked_reason}</div>
                        )}
                        {(candidate.warnings || []).map((warning, index) => (
                          <div key={`${candidate.alias}-warning-${index}`} className="mt-1 text-xs text-muted-foreground">
                            {warning}
                          </div>
                        ))}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {showHostModal && (
        <ModalShell
          title={editingHost ? t('hosts.form.editTitle') : t('hosts.form.addTitle')}
          description={t('hosts.form.desc')}
          onClose={() => setShowHostModal(false)}
          contentStyle={{ maxWidth: '560px' }}
          bodyClassName="grid gap-5"
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowHostModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSaveHost}>{editingHost ? t('common.save') : t('hosts.addHost')}</Button>
            </div>
          )}
        >
          <div className="grid gap-5">
              <div className="grid gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('hosts.form.connection')}
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('hosts.form.name')}</label>
                  <Input
                    value={hostForm.name}
                    onChange={e => setHostForm({ ...hostForm, name: e.target.value })}
                    placeholder="Prod App 1"
                    className="bg-muted/30 focus:bg-background"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('hosts.form.hostAddress')}</label>
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
                    {t('hosts.form.groups')}
                  </div>
                  <Button
                    onClick={() => openGroupModal(undefined, 'host')}
                    variant="secondary"
                    size="sm"
                    className="h-7"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('hosts.form.newGroup')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('hosts.form.groupsDesc')}
                </p>
                {inv.groups.length === 0 ? (
                  <div className="text-xs text-muted-foreground bg-muted/20 border border-border rounded p-3 flex items-center justify-between gap-3">
                    <span>{t('hosts.form.noGroups')}</span>
                    <Button
                      onClick={() => openGroupModal(undefined, 'host')}
                      variant="secondary"
                      size="sm"
                      className="h-7"
                    >
                      {t('hosts.form.addGroup')}
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
                  {t('hosts.form.access')}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">{t('hosts.form.user')}</label>
                    <Input
                      value={hostForm.user}
                      onChange={e => setHostForm({ ...hostForm, user: e.target.value })}
                      placeholder={inv.defaults.user || 'deploy'}
                      className="bg-muted/30 focus:bg-background"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">{t('hosts.form.port')}</label>
                    <Input
                      value={hostForm.port}
                      onChange={e => setHostForm({ ...hostForm, port: e.target.value })}
                      placeholder={String(inv.defaults.port || 22)}
                      className="bg-muted/30 focus:bg-background"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('hosts.form.identityFile')}</label>
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
                  {t('hosts.form.routingTags')}
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('hosts.form.bastionHost')}</label>
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
                  {editingHost && hostJumpChain(editingHost).length > 1 && (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {t('hosts.form.multiJumpHint', {
                        chain: hostJumpChain(editingHost)
                          .map(id => hostMap.get(id)?.name || hostMap.get(id)?.host || id)
                          .join(' -> '),
                      })}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('hosts.form.tags')}</label>
                  <Input
                    value={hostForm.tags}
                    onChange={e => setHostForm({ ...hostForm, tags: e.target.value })}
                    placeholder={t('hosts.form.tagsPlaceholder')}
                    className="bg-muted/30 focus:bg-background"
                  />
                </div>
              </div>
          </div>
        </ModalShell>
      )}

      {showGroupModal && (
        <ModalShell
          title={editingGroup ? t('hosts.group.editTitle') : t('hosts.group.addTitle')}
          description={t('hosts.group.desc')}
          onClose={() => setShowGroupModal(false)}
          overlayClassName={groupModalSource === 'host' ? 'z-[110]' : undefined}
          contentStyle={{ maxWidth: '520px' }}
          bodyClassName="grid gap-3"
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowGroupModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSaveGroup}>{editingGroup ? t('common.save') : t('hosts.form.addGroup')}</Button>
            </div>
          )}
        >
          <div className="grid gap-3">
              {groupModalSource === 'host' && (
                <div className="rounded-md border border-primary/20 bg-primary/10 p-3 text-xs text-muted-foreground">
                  {t('hosts.group.hostDraftHint')}
                </div>
              )}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t('common.name')}</label>
                <Input
                  value={groupForm.name}
                  onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                  placeholder="Prod App Servers"
                  className="bg-muted/30 focus:bg-background"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t('hosts.group.hosts')}</label>
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
                        {t('hosts.group.toggleTag', { tag })}
                      </Button>
                    ))}
                  </div>
                )}
                {inv.hosts.length === 0 ? (
                  <div className="text-xs text-muted-foreground bg-muted/20 border border-border rounded p-3">
                    {t('hosts.group.noHosts')}
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
          title={t('hosts.groupList.title')}
          description={t('hosts.groupList.desc')}
          onClose={() => setShowGroupListModal(false)}
          contentStyle={{ maxWidth: '720px' }}
          footer={(
            <div className="flex items-center justify-between gap-2">
              <Button
                onClick={() => { setShowGroupListModal(false); openGroupModal() }}
                variant="secondary"
              >
                <Plus className="w-4 h-4" />
                {t('hosts.form.addGroup')}
              </Button>
              <Button onClick={() => setShowGroupListModal(false)} variant="ghost">
                {t('common.close')}
              </Button>
            </div>
          )}
        >
          <div>
              {inv.groups.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t('hosts.groupList.empty')}</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {inv.groups.map(group => (
                    <div key={group.id} className="bg-muted/20 border border-border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">{group.name}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {t('hosts.form.hostCount', { count: group.host_ids.length })}
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
                          {t('common.edit')}
                        </Button>
                        <Button onClick={() => handleDeleteGroup(group.id)} variant="destructive" size="sm">
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('common.delete')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </ModalShell>
      )}

    </div>
  )
}

export default Hosts
