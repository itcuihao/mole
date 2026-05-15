import { useEffect, useMemo, useState } from 'react'
import { GetInventory, SaveInventoryDefaults, SaveHost, DeleteHost, SaveHostGroup, DeleteHostGroup, PreviewSSHConfigImport, ImportSSHConfig } from '../../wailsjs/go/main/App'
import { ClipboardSetText } from '../../wailsjs/runtime/runtime'
import { inventory } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { CardDescription, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ModalShell } from "@/components/ui/modal-shell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useTranslation } from "@/i18n/context"
import { Plus, Pencil, Trash2, Copy, X, Server, ChevronDown, ChevronUp, ArrowLeft, Search, Shield } from "lucide-react"

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

const hostSortLabel = (host: HostRecord) => (host.name || host.host || '').toLowerCase()

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
  const [editingGroup, setEditingGroup] = useState<inventory.HostGroup | null>(null)
  const [groupModalSource, setGroupModalSource] = useState<GroupModalSource>('standalone')
  const [groupHostSearch, setGroupHostSearch] = useState('')
  const [showSSHImportModal, setShowSSHImportModal] = useState(false)
  const [sshImportPath, setSSHImportPath] = useState('~/.ssh/config')
  const [sshImportBusy, setSSHImportBusy] = useState<'preview' | 'import' | null>(null)
  const [sshPreview, setSSHPreview] = useState<SSHConfigImportPreviewState | null>(null)
  const [sshSelectedAliases, setSSHSelectedAliases] = useState<string[]>([])
  const [sshConflictStrategy, setSSHConflictStrategy] = useState<'skip' | 'overwrite'>('skip')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [groupForm, setGroupForm] = useState({
    id: '',
    name: '',
    bastion_id: '',
    host_ids: [] as string[],
  })

  const hostMap = useMemo(() => {
    const map = new Map<string, HostRecord>()
    inv.hosts.forEach(h => map.set(h.id, h))
    return map
  }, [inv.hosts])

  const groupsForHost = useMemo(() => {
    const map = new Map<string, inventory.HostGroup[]>()
    inv.groups.forEach(group => {
      (group.host_ids || []).forEach(id => {
        const list = map.get(id) || []
        list.push(group)
        map.set(id, list)
      })
    })
    return map
  }, [inv.groups])

  const bastionUsage = useMemo(() => {
    const usage = new Map<string, { groups: string[]; hosts: string[] }>()
    inv.groups.forEach(group => {
      if (group.bastion_id) {
        const entry = usage.get(group.bastion_id) || { groups: [], hosts: [] }
        entry.groups.push(group.name || 'Group')
        usage.set(group.bastion_id, entry)
      }
    })
    inv.hosts.forEach(host => {
      const chain = hostJumpChain(host)
      chain.forEach(bastionId => {
        if (bastionId !== host.id) {
          const entry = usage.get(bastionId) || { groups: [], hosts: [] }
          entry.hosts.push(host.name || host.host || host.id)
          usage.set(bastionId, entry)
        }
      })
    })
    return usage
  }, [inv.hosts, inv.groups])

  const effectiveBastion = (host: HostRecord): { id: string; name: string; fromGroup?: string } | null => {
    if (host.bastion_id) {
      const b = hostMap.get(host.bastion_id)
      return { id: host.bastion_id, name: b?.name || b?.host || host.bastion_id }
    }
    const groups = groupsForHost.get(host.id) || []
    for (const g of groups) {
      if (g.bastion_id) {
        const b = hostMap.get(g.bastion_id)
        return { id: g.bastion_id, name: b?.name || b?.host || g.bastion_id, fromGroup: g.name }
      }
    }
    return null
  }

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

  const filteredGroupHosts = useMemo(() => {
    const query = groupHostSearch.trim().toLowerCase()
    if (!query) return sortedHosts
    return sortedHosts.filter(host =>
      (host.name || '').toLowerCase().includes(query)
      || (host.host || '').toLowerCase().includes(query)
      || (host.tags || []).some(tag => tag.toLowerCase().includes(query))
    )
  }, [groupHostSearch, sortedHosts])

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
      const matchesGroup = !selectedGroupId
        || (inv.groups.find(g => g.id === selectedGroupId)?.host_ids || []).includes(host.id)
      return matchesQuery && matchesTags && matchesGroup
    })
  }, [search, selectedTags, selectedGroupId, sortedHosts, inv.groups])

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
    setGroupHostSearch('')
    if (group) {
      setEditingGroup(group)
      setGroupForm({
        id: group.id,
        name: group.name || '',
        bastion_id: group.bastion_id || '',
        host_ids: group.host_ids || [],
      })
    } else {
      setEditingGroup(null)
      setGroupForm({
        id: '',
        name: '',
        bastion_id: '',
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
        bastion_id: groupForm.bastion_id || undefined,
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

  const handleDeleteGroup = async (id: string) => {
    try {
      await DeleteHostGroup(id)
      await loadInventory()
      setHostGroupIds(prev => prev.filter(groupID => groupID !== id))
      if (selectedGroupId === id) setSelectedGroupId(null)
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
    setSelectedGroupId(null)
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
    <div className="flex h-full min-h-0 gap-4">
      {/* ── Left sidebar ── */}
      <div className="hidden w-56 shrink-0 flex-col gap-3 md:flex">
        {/* Groups */}
        <div className="surface-panel flex flex-col rounded-2xl border border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('hosts.groups.section')}
            </h2>
            <Button onClick={() => openGroupModal()} variant="ghost" size="sm" className="h-6 w-6 rounded-lg p-0">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setSelectedGroupId(null)}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                selectedGroupId === null
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <span>{t('hosts.allHosts')}</span>
              <span className="text-[10px] tabular-nums">{inv.hosts.length}</span>
            </button>
            {inv.groups.map(group => {
              const bastionHost = group.bastion_id ? hostMap.get(group.bastion_id) : null
              const isSelected = selectedGroupId === group.id
              return (
                <div key={group.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId(isSelected ? null : group.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <span className="truncate">{group.name}</span>
                    <span className="text-[10px] tabular-nums">{(group.host_ids || []).length}</span>
                  </button>
                  {bastionHost && (
                    <div className="flex items-center gap-1 px-2.5 pb-0.5 text-[10px] text-muted-foreground">
                      <Shield className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{bastionHost.name || bastionHost.host}</span>
                    </div>
                  )}
                  {isSelected && (
                    <div className="flex items-center gap-1 px-2.5 pb-1 pt-0.5">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); openGroupModal(group) }}
                        className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleDeleteGroup(group.id) }}
                        className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {inv.groups.length === 0 && (
              <div className="px-2.5 py-2 text-[11px] text-muted-foreground">{t('hosts.noGroups')}</div>
            )}
          </div>
        </div>

        {/* Defaults */}
        <div className="surface-panel flex flex-col rounded-2xl border border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setShowDefaults(prev => !prev)}
            className="flex items-center justify-between gap-2 cursor-pointer"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('hosts.defaults.section')}
            </h2>
            <span className="text-muted-foreground">
              {showDefaults ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>
          {!showDefaults && (
            <div className="mt-2 text-[11px] text-muted-foreground font-mono leading-relaxed">
              <div>{defaultsForm.user || '-'}</div>
              <div>{t('hosts.defaults.port')}: {defaultsForm.port || '22'}</div>
              <div>{defaultsForm.identity_file || '-'}</div>
            </div>
          )}
          {showDefaults && (
            <div className="mt-3 flex flex-col gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">{t('hosts.defaults.user')}</label>
                <Input
                  value={defaultsForm.user}
                  onChange={e => setDefaultsForm({ ...defaultsForm, user: e.target.value })}
                  placeholder="deploy"
                  className="h-8 bg-muted/30 focus:bg-background text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">{t('hosts.defaults.port')}</label>
                <Input
                  value={defaultsForm.port}
                  onChange={e => setDefaultsForm({ ...defaultsForm, port: e.target.value })}
                  placeholder="22"
                  className="h-8 bg-muted/30 focus:bg-background text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">{t('hosts.defaults.identityFile')}</label>
                <Input
                  value={defaultsForm.identity_file}
                  onChange={e => setDefaultsForm({ ...defaultsForm, identity_file: e.target.value })}
                  placeholder="~/.ssh/id_ed25519"
                  className="h-8 bg-muted/30 focus:bg-background text-xs"
                />
              </div>
              <Button onClick={saveDefaults} size="sm" className="h-8 text-xs">{t('hosts.defaults.save')}</Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Header */}
        <div className="surface-panel rounded-2xl border border-border px-5 py-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {onBack && (
                <Button onClick={onBack} variant="ghost" size="sm" className="h-8 w-8 rounded-xl p-0">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <h1 className="text-xl font-semibold text-foreground">{t('hosts.title')}</h1>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <div className="relative min-w-0 flex-1">
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
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                <Button onClick={() => setShowSSHImportModal(true)} variant="outline" size="sm">
                  {t('hosts.import.shortButton')}
                </Button>
                <Button onClick={() => openHostModal()} size="sm" className="shadow-sm">
                  <Plus className="w-4 h-4" />
                  {t('common.add')}
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {t('hosts.summary', { filtered: filteredHosts.length, total: inv.hosts.length })}
            </div>

            {/* Mobile group pills (visible only when sidebar is hidden) */}
            {inv.groups.length > 0 && (
              <div className="flex flex-wrap gap-2 md:hidden">
                <Button
                  onClick={() => setSelectedGroupId(null)}
                  variant="secondary"
                  size="sm"
                  className={selectedGroupId === null
                    ? 'interactive-chip h-8 rounded-full border-primary bg-primary/10 px-3 text-primary'
                    : 'interactive-chip h-8 rounded-full border-border bg-background px-3 text-muted-foreground hover:border-primary/30 hover:text-foreground'}
                >
                  {t('hosts.allHosts')}
                </Button>
                {inv.groups.map(group => (
                  <Button
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    variant="secondary"
                    size="sm"
                    className={selectedGroupId === group.id
                      ? 'interactive-chip h-8 rounded-full border-primary bg-primary/10 px-3 text-primary'
                      : 'interactive-chip h-8 rounded-full border-border bg-background px-3 text-muted-foreground hover:border-primary/30 hover:text-foreground'}
                  >
                    {group.name}
                  </Button>
                ))}
              </div>
            )}

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
                {(search || selectedTags.length > 0 || selectedGroupId) && (
                  <Button onClick={clearFilters} variant="ghost" size="sm" className="h-8 rounded-full px-3">
                    {t('common.clear')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Status banners */}
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

        {/* Host grid */}
        <div className="app-scroll min-h-0 flex-1 overflow-auto pr-1">
          <div className="grid gap-3 pb-2 sm:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              <div className="surface-panel rounded-2xl border border-border bg-muted/15 px-6 py-10 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">{t('hosts.loading')}</div>
            ) : inv.hosts.length === 0 ? (
              <div className="surface-panel rounded-2xl border border-border bg-muted/15 px-6 py-12 text-center text-muted-foreground sm:col-span-2 xl:col-span-3">
                {t('hosts.empty')}
              </div>
            ) : filteredHosts.length === 0 ? (
              <div className="surface-panel rounded-2xl border border-border bg-muted/15 px-6 py-12 text-center text-muted-foreground sm:col-span-2 xl:col-span-3">
                {t('hosts.noFilterMatch')}
              </div>
            ) : (
              filteredHosts.map(host => {
                const bastion = effectiveBastion(host)
                const jumpChain = hostJumpChain(host)
                const command = buildSSHCommand(host)
                const usage = bastionUsage.get(host.id)
                const inheritedFields = [
                  (!host.user && inv.defaults.user) ? t('hosts.defaults.user') : '',
                  (!host.port && inv.defaults.port) ? t('hosts.defaults.port') : '',
                  (!host.identity_file && inv.defaults.identity_file) ? t('hosts.defaults.identityFile') : '',
                ].filter(Boolean)
                return (
                  <div key={host.id} className="breathing-card surface-panel flex flex-col rounded-2xl border border-border bg-card p-4 transition-all">
                    <div className="flex flex-col gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-muted-foreground" />
                          <span className="truncate text-sm font-medium text-foreground">
                            {host.name || host.host || t('hosts.untitled')}
                          </span>
                          {usage && (
                            <Badge variant="secondary" className="shrink-0 rounded-full border border-primary/20 bg-primary/10 text-[10px] text-primary">
                              <Shield className="w-2.5 h-2.5 mr-0.5" />
                              {t('hosts.bastionRole')}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-1">
                          {(host.user || inv.defaults.user) ? `${host.user || inv.defaults.user}@` : ''}
                          {host.host}
                          {(host.port || inv.defaults.port) && (host.port || inv.defaults.port) !== 22 ? `:${host.port || inv.defaults.port}` : ''}
                        </div>
                        {bastion && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <span>{t('hosts.bastion', { name: bastion.name })}</span>
                            {bastion.fromGroup && (
                              <span className="text-[10px] text-muted-foreground/70">
                                ({t('hosts.bastionFromGroup', { group: bastion.fromGroup })})
                              </span>
                            )}
                          </div>
                        )}
                        {usage && (
                          <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                            {t('hosts.bastionUsedBy', {
                              names: [...usage.groups.map(g => `${g}`), ...usage.hosts].join(', '),
                            })}
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
                        {inheritedFields.length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t('hosts.inheritedFromDefault', { fields: inheritedFields.join(', ') })}
                          </div>
                        )}
                        {host.tags && host.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {host.tags.map(tag => (
                              <Badge key={tag} variant="secondary" className="rounded-full border border-border/80 bg-muted/30 text-[10px] text-muted-foreground">{tag}</Badge>
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
              })
            )}
          </div>
        </div>
      </div>

      {/* ── SSH Import Modal ── */}
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

      {/* ── Host Form Modal ── */}
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
                        .map(h => {
                          const isBastion = bastionUsage.has(h.id)
                          return (
                            <SelectItem key={h.id} value={h.id}>
                              <span className="flex items-center gap-1.5">
                                {isBastion && <Shield className="w-3 h-3 text-primary" />}
                                <span>{h.name || h.host}</span>
                              </span>
                            </SelectItem>
                          )
                        })}
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

      {/* ── Group Form Modal ── */}
      {showGroupModal && (
        <ModalShell
          title={editingGroup ? t('hosts.group.editTitle') : t('hosts.group.addTitle')}
          description={t('hosts.group.desc')}
          onClose={() => setShowGroupModal(false)}
          overlayClassName={groupModalSource === 'host' ? 'z-[110]' : undefined}
          contentStyle={{ maxWidth: '560px' }}
          bodyClassName="grid gap-5"
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowGroupModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSaveGroup}>{editingGroup ? t('common.save') : t('hosts.form.addGroup')}</Button>
            </div>
          )}
        >
          <div className="grid gap-5">
              {groupModalSource === 'host' && (
                <div className="rounded-md border border-primary/20 bg-primary/10 p-3 text-xs text-muted-foreground">
                  {t('hosts.group.hostDraftHint')}
                </div>
              )}

              {/* Basic Info */}
              <div className="grid gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('hosts.group.section.basic')}
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('common.name')}</label>
                  <Input
                    value={groupForm.name}
                    onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                    placeholder="Prod App Servers"
                    className="bg-muted/30 focus:bg-background"
                  />
                </div>
              </div>

              {/* Routing */}
              <div className="grid gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('hosts.group.section.routing')}
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('hosts.group.bastion')}</label>
                  <Select
                    value={groupForm.bastion_id || '__none__'}
                    onValueChange={value => setGroupForm({ ...groupForm, bastion_id: value === '__none__' ? '' : value })}
                  >
                    <SelectTrigger className="bg-muted/30 focus:bg-background">
                      <SelectValue placeholder={t('hosts.group.bastionPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent className="z-[110]">
                      <SelectItem value="__none__">{t('hosts.group.noBastion')}</SelectItem>
                      {sortedHosts.map(host => {
                        const isBastion = bastionUsage.has(host.id)
                        return (
                          <SelectItem key={host.id} value={host.id}>
                            <span className="flex items-center gap-1.5">
                              {isBastion && <Shield className="w-3 h-3 text-primary" />}
                              <span>{host.name || host.host}</span>
                              {host.host && <span className="text-muted-foreground">({host.host})</span>}
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">{t('hosts.group.bastionHint')}</p>
                </div>
              </div>

              {/* Members (only when editing) */}
              {editingGroup && (
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('hosts.group.section.members', { count: groupForm.host_ids.length })}
                  </div>
                  {allTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.map(tag => (
                        <Button
                          key={tag}
                          onClick={() => toggleGroupByTag(tag)}
                          variant="secondary"
                          size="sm"
                          className="h-6 px-1.5 text-[10px] bg-muted/30"
                        >
                          {tag}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                {inv.hosts.length === 0 ? (
                  <div className="text-xs text-muted-foreground bg-muted/20 border border-border rounded-lg p-3">
                    {t('hosts.group.noHosts')}
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={groupHostSearch}
                        onChange={e => setGroupHostSearch(e.target.value)}
                        placeholder={t('hosts.group.members.search')}
                        className="h-8 rounded-lg border-border bg-muted/30 pl-8 pr-8 text-xs focus:bg-background"
                      />
                      {groupHostSearch && (
                        <button
                          type="button"
                          onClick={() => setGroupHostSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                          aria-label={t('common.clear')}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="border border-border rounded-lg bg-muted/20 max-h-56 overflow-auto">
                      {filteredGroupHosts.map(host => {
                        const checked = groupForm.host_ids.includes(host.id)
                        const isBastion = bastionUsage.has(host.id)
                        return (
                          <label
                            key={host.id}
                            className={`flex items-center gap-2.5 px-3 py-2 text-xs border-b border-border/50 last:border-b-0 cursor-pointer transition-colors ${
                              checked ? 'bg-primary/5 text-foreground' : 'text-foreground hover:bg-muted/30'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleGroupHost(host.id)}
                              className="h-3.5 w-3.5 shrink-0 accent-primary"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium truncate">{host.name || host.host}</span>
                                {isBastion && (
                                  <Shield className="w-3 h-3 shrink-0 text-primary" />
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground font-mono truncate">
                                {(host.user || inv.defaults.user) ? `${host.user || inv.defaults.user}@` : ''}{host.host}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                      {filteredGroupHosts.length === 0 && (
                        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                          {t('hosts.noFilterMatch')}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              )}
          </div>
        </ModalShell>
      )}

    </div>
  )
}

export default Hosts
