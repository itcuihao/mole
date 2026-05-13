import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ListSessions, AttachSession, AttachSessionWithTerminal, KillSession, DetachSession, RestartSession, ListProfiles, GetInstalledTerminals, GetDefaultTerminal, GetInventory } from '../../wailsjs/go/main/App'
import { codex, docker, session, profile, terminal, inventory } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ModalShell } from "@/components/ui/modal-shell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/i18n/context"
import { Bot, Box, Play, Plus, TerminalSquare, Pencil, Trash2, X, ChevronDown, FolderGit2, Server, Wrench, CheckCircle2, ChevronRight, Search, MoreHorizontal, Copy, RotateCw, LogOut } from "lucide-react"
import type { AppTab, NavigateContext } from '../App'

type SessionSortMode = 'most_used' | 'name' | 'profile'
type SessionRecord = session.SessionStatus & {
  run_mode?: string
  host_id?: string
  codex_config_id?: string
  den?: string
  open_count?: number
  last_opened_at?: string
}

type SessionDraft = {
  profileID: string
  runMode: string
  hostID: string
  command: string
  sessionName: string
  den: string
  sourceName?: string
}

const SESSION_SORT_LABEL_KEYS: Record<SessionSortMode, string> = {
  most_used: 'burrows.sort.mostUsed',
  name: 'burrows.sort.nameAZ',
  profile: 'burrows.sort.profile',
}

const SESSION_MENU_PANEL_CLASS = 'absolute right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-sm animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 origin-top-right'
const SESSION_MENU_LABEL_CLASS = 'border-b border-border/60 bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground'
const SESSION_MENU_ITEM_CLASS = 'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground'
const SESSION_MENU_DESTRUCTIVE_ITEM_CLASS = 'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10'
const ALL_PROFILE_FILTER_VALUE = '__all_profiles__'
const NO_DEN_FILTER_VALUE = '__no_den__'

const KNOWN_RUN_MODES = new Set(['shell', 'host', 'custom', 'codex', 'docker'])

const normalizeRunMode = (value?: string, hasCommand = false, availableModes?: Set<string>): string => {
  const modes = availableModes && availableModes.size > 0 ? availableModes : KNOWN_RUN_MODES
  if (value && modes.has(value)) {
    return value
  }
  return hasCommand ? 'custom' : 'shell'
}

const compareAlpha = (left: string, right: string) => (
  left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true })
)

const parseTimestamp = (value?: string) => {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

const sessionPriority = (sess: SessionRecord) => {
  if (sess.attached) return 0
  if (sess.alive) return 1
  return 2
}

const compareSessions = (left: SessionRecord, right: SessionRecord) => {
  const priorityDiff = sessionPriority(left) - sessionPriority(right)
  if (priorityDiff !== 0) return priorityDiff

  // Open count first — stable, only changes when a session crosses another's count.
  const openCountDiff = (right.open_count || 0) - (left.open_count || 0)
  if (openCountDiff !== 0) return openCountDiff

  // Tiebreak by most recently opened.
  const recentDiff = parseTimestamp(right.last_opened_at) - parseTimestamp(left.last_opened_at)
  if (recentDiff !== 0) return recentDiff

  const createdDiff = parseTimestamp(right.created_at) - parseTimestamp(left.created_at)
  if (createdDiff !== 0) return createdDiff

  return compareAlpha(left.name || '', right.name || '')
}

const compareSessionsByName = (left: SessionRecord, right: SessionRecord) => {
  const nameDiff = compareAlpha(left.name || '', right.name || '')
  if (nameDiff !== 0) return nameDiff
  return compareSessions(left, right)
}

const compareSessionsByProfile = (left: SessionRecord, right: SessionRecord) => {
  const profileDiff = compareAlpha(left.profile_name || '', right.profile_name || '')
  if (profileDiff !== 0) return profileDiff
  return compareSessions(left, right)
}

const profileLabel = (item: profile.Profile) => item.name || ''
const hostLabel = (host: inventory.Host) => (host.name || host.host || '').trim()

const buildDuplicateSessionName = (baseName: string, existingNames: string[]) => {
  const normalizedBase = baseName.trim() || 'session'
  const nameSet = new Set(existingNames.map(name => name.trim().toLowerCase()).filter(Boolean))
  const firstCandidate = `${normalizedBase}-copy`

  if (!nameSet.has(firstCandidate.toLowerCase())) {
    return firstCandidate
  }

  let index = 2
  while (nameSet.has(`${firstCandidate}-${index}`.toLowerCase())) {
    index += 1
  }

  return `${firstCandidate}-${index}`
}

const EMPTY_INVENTORY = inventory.Inventory.createFrom({
  version: 1,
  defaults: { user: '', port: 22, identity_file: '' },
  hosts: [],
  groups: [],
})

const buildSSHCommand = (
  host: inventory.Host,
  defaults: inventory.HostDefaults,
  hostMap: Map<string, inventory.Host>
) => {
  if (!host.host) return ''
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

const findHostIDForCommand = (
  command: string,
  inv: inventory.Inventory,
  hostMap: Map<string, inventory.Host>
) => {
  const normalized = command.trim()
  if (!normalized) return ''

  for (const host of inv.hosts) {
    if (buildSSHCommand(host, inv.defaults, hostMap) === normalized) {
      return host.id
    }
  }

  return ''
}

function CommandText({
  command,
  className,
}: {
  command: string
  className?: string
}) {
  const lines = command.split(/\r?\n/)

  return (
    <div className={cn('min-w-0 overflow-hidden font-mono leading-relaxed', className)}>
      {lines.map((line, lineIndex) => {
        const parts = line.match(/\S+/g) ?? []

        if (parts.length === 0) {
          return (
            <div key={lineIndex} className={lineIndex > 0 ? 'mt-1' : undefined}>
              <span className="block h-[1lh]" aria-hidden="true" />
            </div>
          )
        }

        return (
          <div
            key={lineIndex}
            className={cn('flex min-w-0 flex-wrap items-start gap-x-[1ch]', lineIndex > 0 && 'mt-1')}
          >
            {parts.map((part, partIndex) => (
              <span key={`${lineIndex}-${partIndex}`} className="whitespace-nowrap">
                {part}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function RunModeOption({
  mode,
  labelKey,
  activeMode,
  onSelect,
  disabled = false,
}: {
  mode: string
  labelKey: string
  activeMode: string
  onSelect: (mode: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const selected = mode === activeMode

  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-xl border px-4 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? 'border-primary bg-primary/8 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)]'
          : 'border-border bg-background hover:border-primary/30 hover:bg-muted/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {t(labelKey)}
        </span>
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-transparent text-transparent'
          }`}
          aria-hidden="true"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  )
}

const getAppMethod = (method: string) => {
  return (window as any)?.go?.main?.App?.[method]
}

const createSessionWithOptions = (
  profileID: string,
  name: string,
  command: string,
  runMode: string,
  hostID: string,
  codexConfigID: string,
  den: string,
) => {
  const method = getAppMethod('CreateSessionWithOptions')
  if (typeof method !== 'function') {
    return Promise.reject(new Error('CreateSessionWithOptions is unavailable'))
  }
  return method(profileID, name, command, runMode, hostID, codexConfigID, den) as Promise<void>
}

const updateSessionWithOptions = (
  sessionID: string,
  profileID: string,
  command: string,
  runMode: string,
  hostID: string,
  codexConfigID: string,
  den: string,
) => {
  const method = getAppMethod('UpdateSessionWithOptions')
  if (typeof method !== 'function') {
    return Promise.reject(new Error('UpdateSessionWithOptions is unavailable'))
  }
  return method(sessionID, profileID, command, runMode, hostID, codexConfigID, den) as Promise<void>
}

function Sessions({
  onNavigate,
  newSessionSignal,
  burrowRefreshSignal,
  onDiscard,
  onNewSessionSignalHandled,
}: {
  onNavigate: (tab: AppTab, ctx?: NavigateContext) => void
  newSessionSignal?: number
  burrowRefreshSignal?: number
  onDiscard?: () => void
  onNewSessionSignalHandled?: () => void
}) {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [terminals, setTerminals] = useState<terminal.TerminalApp[]>([])
  const [defaultTerminal, setDefaultTerminal] = useState<string>('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingSession, setEditingSession] = useState<SessionRecord | null>(null)
  const [duplicateDraft, setDuplicateDraft] = useState<SessionDraft | null>(null)
  const [error, setError] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<SessionSortMode>('name')
  const [profiles, setProfiles] = useState<profile.Profile[]>([])
  const [selectedDenFilter, setSelectedDenFilter] = useState<string>('')
  const [selectedProfileFilter, setSelectedProfileFilter] = useState<string>('')
  const [inventoryCount, setInventoryCount] = useState(0)
  const [sessionAction, setSessionAction] = useState<{ id: string, kind: 'open' | 'kill' | 'detach' | 'restart' } | null>(null)

  const refresh = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListSessions()
        .then(data => setSessions((data || []) as SessionRecord[]))
        .catch(err => setError(String(err)))
    }
  }, [])

  const loadMeta = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      GetInstalledTerminals()
        .then(t => setTerminals(t || []))
        .catch(() => {})

      GetDefaultTerminal()
        .then(term => setDefaultTerminal(term || ''))
        .catch(() => {})

      ListProfiles()
        .then(p => setProfiles(p || []))
        .catch(() => {})

      GetInventory()
        .then(data => setInventoryCount((data?.hosts || []).length))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    loadMeta()
  }, [loadMeta, burrowRefreshSignal])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh, burrowRefreshSignal])

  useEffect(() => {
    if (!newSessionSignal) return
    setShowNewModal(true)
    onNewSessionSignalHandled?.()
  }, [newSessionSignal])

  const showTimedInfo = (text: string, duration = 7000) => {
    setInfoMessage(text)
    setTimeout(() => setInfoMessage(''), duration)
  }

  const showAttachHint = (terminalID: string, wasRestarted = false) => {
    const needsManualPaste = ['warp', 'alacritty', 'kitty', 'rio', 'ghostty'].includes(terminalID)

    if (needsManualPaste) {
      showTimedInfo(
        wasRestarted
          ? t('burrows.info.restoredPaste')
          : t('burrows.info.clipboardPaste')
      )
      return
    }

    if (wasRestarted) {
      showTimedInfo(t('burrows.info.restored'))
    }
  }

  const handleOpenSession = async (sess: SessionRecord, terminalID?: string) => {
    const resolvedTerminal = terminalID || defaultTerminal
    const wasRestarted = !sess.alive

    setSessionAction({ id: sess.id, kind: 'open' })
    setError('')
    try {
      if (!sess.alive) {
        await RestartSession(sess.id)
      }

      if (terminalID) {
        await AttachSessionWithTerminal(sess.id, terminalID)
      } else {
        await AttachSession(sess.id)
      }

      showAttachHint(resolvedTerminal, wasRestarted)
      refresh()
    } catch (err) {
      const errorMsg = String(err)
      console.error('❌ Open burrow failed:', errorMsg)
      setError(errorMsg)
    } finally {
      setSessionAction(null)
    }
  }

  const handleKill = async (sess: SessionRecord) => {
    setSessionAction({ id: sess.id, kind: 'kill' })
    setError('')
    try {
      await KillSession(sess.id)
      if (!sess.alive) {
        showTimedInfo(t('burrows.info.offlineRemoved'))
      }
      refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setSessionAction(null)
    }
  }

  const handleDetach = async (sess: SessionRecord) => {
    setSessionAction({ id: sess.id, kind: 'detach' })
    setError('')
    try {
      await DetachSession(sess.id)
      showTimedInfo(t('burrows.info.detached'))
      refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setSessionAction(null)
    }
  }

  const handleRestart = async (sess: SessionRecord) => {
    setSessionAction({ id: sess.id, kind: 'restart' })
    setError('')
    try {
      await RestartSession(sess.id)
      refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setSessionAction(null)
    }
  }

  const normalizedQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery])
  const denOptions = useMemo(() => {
    const denCount = new Map<string, { den: string; count: number }>()
    for (const s of sessions) {
      const den = (s.den || '').trim()
      const key = den || NO_DEN_FILTER_VALUE
      const current = denCount.get(key)
      if (current) {
        current.count += 1
      } else {
        denCount.set(key, { den, count: 1 })
      }
    }

    return Array.from(denCount.entries())
      .map(([key, meta]) => ({
        key,
        den: meta.den,
        count: meta.count,
      }))
      .sort((a, b) => {
        if (!a.den && b.den) return 1
        if (a.den && !b.den) return -1
        return compareAlpha(a.den, b.den)
      })
  }, [sessions])

  const sortedSessions = useMemo(() => {
    const base = [...sessions]
    switch (sortMode) {
      case 'name':
        return base.sort(compareSessionsByName)
      case 'profile':
        return base.sort(compareSessionsByProfile)
      case 'most_used':
      default:
        return base.sort(compareSessions)
    }
  }, [sessions, sortMode])

  const sessionsByDen = useMemo(() => {
    if (!selectedDenFilter) {
      return sortedSessions
    }

    return sortedSessions.filter(s => {
      const den = (s.den || '').trim()
      if (selectedDenFilter === NO_DEN_FILTER_VALUE) {
        return !den
      }
      return den === selectedDenFilter
    })
  }, [sortedSessions, selectedDenFilter])

  const profilesInUse = useMemo(() => {
    const usedIds = new Set(sessionsByDen.map(s => s.profile_id).filter(Boolean))
    return profiles
      .filter(p => usedIds.has(p.id))
      .sort((a, b) => compareAlpha(a.name || '', b.name || ''))
  }, [sessionsByDen, profiles])

  useEffect(() => {
    if (!selectedDenFilter) return
    if (!denOptions.some(option => option.key === selectedDenFilter)) {
      setSelectedDenFilter('')
    }
  }, [selectedDenFilter, denOptions])

  useEffect(() => {
    if (!selectedProfileFilter) return
    if (!profilesInUse.some(p => p.id === selectedProfileFilter)) {
      setSelectedProfileFilter('')
    }
  }, [selectedProfileFilter, profilesInUse])

  const filteredSessions = useMemo(() => {
    let result = sessionsByDen
    if (selectedProfileFilter) {
      result = result.filter(s => s.profile_id === selectedProfileFilter)
    }
    if (normalizedQuery) {
      const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
      result = result.filter(s => {
        const name = (s.name || '').toLowerCase()
        return tokens.every(token => name.includes(token))
      })
    }
    return result
  }, [sessionsByDen, selectedProfileFilter, normalizedQuery])

  const handleDuplicateSession = useCallback((sess: SessionRecord) => {
    setDuplicateDraft({
      profileID: sess.profile_id,
      runMode: normalizeRunMode(sess.run_mode, Boolean(sess.command)),
      hostID: sess.host_id || '',
      command: sess.command || '',
      den: sess.den || '',
      sessionName: buildDuplicateSessionName(
        sess.name || 'session',
        sessions.map(item => item.name || ''),
      ),
      sourceName: sess.name || '',
    })
  }, [sessions])

  return (
    <div className="min-w-0 h-full flex flex-col">
      <div className="shrink-0">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold text-foreground">{t('burrows.title')}</h1>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {sessions.length > 0 && (
              <Select value={sortMode} onValueChange={value => setSortMode(value as SessionSortMode)}>
                <SelectTrigger className="h-9 w-full bg-background sm:w-[148px]">
                  <SelectValue aria-label={t('burrows.sortedBy', { mode: t(SESSION_SORT_LABEL_KEYS[sortMode]) })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="most_used">{t('burrows.sort.mostUsed')}</SelectItem>
                  <SelectItem value="name">{t('burrows.sort.nameAZ')}</SelectItem>
                  <SelectItem value="profile">{t('burrows.sort.profile')}</SelectItem>
                </SelectContent>
              </Select>
            )}
            {sessions.length > 0 && (
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('burrows.searchPlaceholder')}
                  aria-label={t('burrows.searchAriaLabel')}
                  className="h-9 w-full pl-8 pr-8 sm:w-56"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={t('burrows.clearSearch')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <Button onClick={() => setShowNewModal(true)} size="sm">
              <Plus className="w-4 h-4" />
              {t('burrows.newBurrow')}
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

        {infoMessage && (
          <div className="mb-4 p-4 bg-primary/10 border border-primary/30 rounded-lg text-foreground text-sm flex items-start justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-2 flex-1">
              <TerminalSquare className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <span className="flex-1 leading-relaxed">{infoMessage}</span>
            </div>
            <Button onClick={() => setInfoMessage('')} variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-primary/20 rounded-full">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {sessions.length > 0 && (
          <>
            <div className="mb-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedDenFilter('')}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    !selectedDenFilter
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  }`}
                >
                  {t('burrows.den.all')}
                  <span className="text-[11px] opacity-80">{sessions.length}</span>
                </button>
                {denOptions.map(option => {
                  const isSelected = selectedDenFilter === option.key
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setSelectedDenFilter(isSelected ? '' : option.key)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground'
                      }`}
                    >
                      <span>{option.den || t('burrows.den.none')}</span>
                      <span className="text-[11px] opacity-80">{option.count}</span>
                    </button>
                  )
                })}
              </div>
              {profilesInUse.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
                    {t('burrows.profileFilter')}
                  </span>
                  <Select
                    value={selectedProfileFilter || ALL_PROFILE_FILTER_VALUE}
                    onValueChange={value => setSelectedProfileFilter(value === ALL_PROFILE_FILTER_VALUE ? '' : value)}
                  >
                    <SelectTrigger className="h-8 w-full rounded-full border-border bg-background px-3 text-xs sm:w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_PROFILE_FILTER_VALUE}>{t('burrows.all')}</SelectItem>
                      {profilesInUse.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name || t('common.none')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="mb-3 text-xs text-muted-foreground">
              {searchQuery || selectedProfileFilter || selectedDenFilter
                ? t('burrows.showing', { filtered: filteredSessions.length, total: sessions.length })
                : t('burrows.sortedBy', { mode: t(SESSION_SORT_LABEL_KEYS[sortMode]) })}
            </div>
          </>
        )}
      </div>

      {sessions.length === 0 ? (
        <EmptySessionsState
          profileCount={profiles.length}
          hostCount={inventoryCount}
          onCreateSession={() => setShowNewModal(true)}
          onNavigate={onNavigate}
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-auto pr-1">
          {filteredSessions.length === 0 ? (
            <div className="border border-border bg-muted/20 rounded-lg p-6 text-sm text-muted-foreground">
              {selectedProfileFilter
                ? (searchQuery ? t('burrows.noMatchInProfileSearch', { query: searchQuery }) : t('burrows.noMatchInProfile'))
                : t('burrows.noMatch', { query: searchQuery })}
            </div>
          ) : (
            <div className="grid gap-3 pb-2">
              {filteredSessions.map(s => (
                <SessionCard
                  key={s.id}
                  session={s}
                  terminals={terminals}
                  onOpen={handleOpenSession}
                  onKill={handleKill}
                  onDetach={handleDetach}
                  onRestart={handleRestart}
                  onEdit={setEditingSession}
                  onDuplicate={handleDuplicateSession}
                  isWorking={sessionAction?.id === s.id}
                  currentAction={sessionAction?.id === s.id ? sessionAction.kind : null}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showNewModal && (
        <NewSessionModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => { setShowNewModal(false); refresh() }}
          onNavigate={onNavigate}
          onDiscard={onDiscard}
        />
      )}

      {duplicateDraft && (
        <NewSessionModal
          initialDraft={duplicateDraft}
          onClose={() => setDuplicateDraft(null)}
          onCreated={() => { setDuplicateDraft(null); refresh() }}
          onNavigate={onNavigate}
          onDiscard={onDiscard}
        />
      )}

      {editingSession && (
        <EditSessionModal
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onUpdated={() => { setEditingSession(null); refresh() }}
        />
      )}
    </div>
  )
}

function SessionCard({
  session: s,
  terminals,
  onOpen,
  onKill,
  onDetach,
  onRestart,
  onEdit,
  onDuplicate,
  isWorking,
  currentAction,
}: {
  session: SessionRecord
  terminals: terminal.TerminalApp[]
  onOpen: (session: SessionRecord, terminalID?: string) => void
  onKill: (session: SessionRecord) => void
  onDetach: (session: SessionRecord) => void
  onRestart: (session: SessionRecord) => void
  onEdit: (session: SessionRecord) => void
  onDuplicate: (session: SessionRecord) => void
  isWorking: boolean
  currentAction: 'open' | 'kill' | 'detach' | 'restart' | null
}) {
  const { t } = useTranslation()
  const [showTerminalMenu, setShowTerminalMenu] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const terminalMenuRef = useRef<HTMLDivElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (terminalMenuRef.current && terminalMenuRef.current.contains(target)) return
      if (moreMenuRef.current && moreMenuRef.current.contains(target)) return
      setShowTerminalMenu(false)
      setShowMoreMenu(false)
    }
    if (showTerminalMenu || showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTerminalMenu, showMoreMenu])

  const statusColor = !s.alive
    ? 'bg-muted-foreground/70'
    : s.attached
      ? 'bg-green-500 dark:bg-green-400'
      : 'bg-yellow-500 dark:bg-yellow-400'
  const statusText = !s.alive ? t('burrows.status.offline') : (s.attached ? t('burrows.status.attached') : t('burrows.status.ready'))
  const primaryLabel = isWorking && currentAction === 'open'
    ? (!s.alive ? t('burrows.status.restoring') : t('burrows.status.opening'))
    : (!s.alive ? t('burrows.restoreBurrow') : t('burrows.openBurrow'))
  const destructiveLabel = isWorking && currentAction === 'kill'
    ? (!s.alive ? t('burrows.status.removing') : t('burrows.status.killing'))
    : (!s.alive ? t('burrows.remove') : t('burrows.kill'))
  const restartLabel = isWorking && currentAction === 'restart'
    ? t('burrows.status.restarting')
    : t('burrows.restart')
  const detachLabel = isWorking && currentAction === 'detach'
    ? t('burrows.status.detaching')
    : t('burrows.detach')

  const handleTerminalSelect = (terminalID: string) => {
    setShowTerminalMenu(false)
    onOpen(s, terminalID)
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor}`} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground">{s.name}</div>
          <div className="text-sm text-muted-foreground">
            {s.profile_name && (
              <span className="inline-flex items-center gap-1">
                {s.profile_color && (
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: s.profile_color }}
                  />
                )}
                {s.profile_name}
                <span className="mx-1 text-muted-foreground/50">|</span>
              </span>
            )}
            {statusText}
            <span className="mx-1 text-muted-foreground/50">|</span>
            {s.alive ? t('burrows.windowCount', { count: s.windows }) : t('burrows.willRestore')}
          </div>
          {s.command && (
            <div
              className="mt-1.5 flex min-w-0 flex-wrap items-start gap-x-1 gap-y-0.5 text-xs leading-relaxed text-muted-foreground/70"
              title={t('burrows.autoRunsHint', { command: s.command })}
            >
              <span className="shrink-0 font-mono">{t('burrows.startup')}</span>
              <CommandText command={s.command} className="min-w-0 flex-1" />
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap sm:justify-end sm:self-center">
        <div className="relative" ref={terminalMenuRef}>
          <div className="flex">
            <Button
              onClick={() => onOpen(s)}
              size="sm"
              className="rounded-r-none pr-2"
              disabled={isWorking}
            >
              <Play className="w-3.5 h-3.5" />
              {primaryLabel}
            </Button>
            {terminals.length > 0 && (
              <Button
                onClick={() => {
                  setShowTerminalMenu(!showTerminalMenu)
                  setShowMoreMenu(false)
                }}
                size="sm"
                className={`rounded-l-none border-l border-primary-foreground/20 pl-1 pr-1.5 ${showTerminalMenu ? 'bg-primary/90' : ''}`}
                disabled={isWorking}
              >
                <ChevronDown className="w-3 h-3" />
              </Button>
            )}
          </div>
          {showTerminalMenu && terminals.length > 0 && (
            <div className={`${SESSION_MENU_PANEL_CLASS} w-48`}>
              <div className={SESSION_MENU_LABEL_CLASS}>
                {t('burrows.openWith')}
              </div>
              {terminals.map(term => (
                <button
                  key={term.ID}
                  onClick={() => handleTerminalSelect(term.ID)}
                  className={SESSION_MENU_ITEM_CLASS}
                >
                  <TerminalSquare className="w-4 h-4 text-muted-foreground" />
                  <span>{term.Name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative" ref={moreMenuRef}>
          <Button
            onClick={() => {
              setShowMoreMenu(!showMoreMenu)
              setShowTerminalMenu(false)
            }}
            variant="secondary"
            size="sm"
            className={`w-9 px-0 ${showMoreMenu ? 'border-border bg-popover text-popover-foreground shadow-lg backdrop-blur-sm' : 'bg-secondary text-secondary-foreground hover:bg-secondary/90'}`}
            aria-label={t('burrows.moreActions')}
            disabled={isWorking}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
          {showMoreMenu && (
            <div className={`${SESSION_MENU_PANEL_CLASS} w-44`}>
              <div className={SESSION_MENU_LABEL_CLASS}>
                {t('burrows.actions')}
              </div>
              <button
                onClick={() => {
                  setShowMoreMenu(false)
                  onDuplicate(s)
                }}
                className={SESSION_MENU_ITEM_CLASS}
              >
                <Copy className="w-4 h-4 text-muted-foreground" />
                <span>{t('common.duplicate')}</span>
              </button>
              <button
                onClick={() => {
                  setShowMoreMenu(false)
                  onEdit(s)
                }}
                className={SESSION_MENU_ITEM_CLASS}
              >
                <Pencil className="w-4 h-4 text-muted-foreground" />
                <span>{t('common.edit')}</span>
              </button>
              {s.alive && (
                <button
                  onClick={() => {
                    setShowMoreMenu(false)
                    onDetach(s)
                  }}
                  className={SESSION_MENU_ITEM_CLASS}
                >
                  <LogOut className="w-4 h-4 text-muted-foreground" />
                  <span>{detachLabel}</span>
                </button>
              )}
              {s.alive && (
                <button
                  onClick={() => {
                    setShowMoreMenu(false)
                    onRestart(s)
                  }}
                  className={SESSION_MENU_ITEM_CLASS}
                >
                  <RotateCw className="w-4 h-4 text-muted-foreground" />
                  <span>{restartLabel}</span>
                </button>
              )}
              <button
                onClick={() => {
                  setShowMoreMenu(false)
                  onKill(s)
                }}
                className={SESSION_MENU_DESTRUCTIVE_ITEM_CLASS}
              >
                <Trash2 className="w-4 h-4" />
                <span>{destructiveLabel}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptySessionsState({
  profileCount,
  hostCount,
  onCreateSession,
  onNavigate,
}: {
  profileCount: number
  hostCount: number
  onCreateSession: () => void
  onNavigate: (tab: AppTab, ctx?: NavigateContext) => void
}) {
  const { t } = useTranslation()
  const checklist = [
    {
      key: 'profile',
      title: t('burrows.empty.profileTitle'),
      description: t('burrows.empty.profileDesc'),
      done: profileCount > 0,
      actionLabel: profileCount > 0 ? t('burrows.empty.manageProfiles') : t('burrows.empty.addProfile'),
      action: () => onNavigate('profiles'),
      icon: FolderGit2,
    },
    {
      key: 'host',
      title: t('burrows.empty.hostTitle'),
      description: t('burrows.empty.hostDesc'),
      done: hostCount > 0,
      actionLabel: hostCount > 0 ? t('burrows.empty.manageHosts') : t('burrows.empty.addHost'),
      action: () => onNavigate('hosts'),
      icon: Server,
    },
    {
      key: 'session',
      title: t('burrows.empty.sessionTitle'),
      description: t('burrows.empty.sessionDesc'),
      done: false,
      actionLabel: t('burrows.newBurrow'),
      action: onCreateSession,
      icon: Wrench,
    },
  ]

  return (
    <Card className="overflow-hidden border-primary/15">
      <CardHeader className="border-b border-border/70 bg-card/70">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TerminalSquare className="w-5 h-5 text-primary" />
          {t('burrows.empty.title')}
        </CardTitle>
        <CardDescription>
          {t('burrows.empty.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        {checklist.map((item, index) => {
          const Icon = item.icon
          return (
            <div
              key={item.key}
              className="flex items-start gap-4 rounded-lg border border-border bg-muted/15 p-4"
            >
              <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-full border ${item.done ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}>
                {item.done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">0{index + 1}</span>
                  <h3 className="text-sm font-medium text-foreground">{item.title}</h3>
                  {item.done && <Badge variant="secondary" className="text-[10px]">{t('common.ready')}</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
              <Button onClick={item.action} variant={item.done ? 'secondary' : 'default'} size="sm" className="shrink-0">
                {item.actionLabel}
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function NewSessionModal({
  initialDraft,
  onClose,
  onCreated,
  onNavigate,
  onDiscard,
}: {
  initialDraft?: SessionDraft | null
  onClose: () => void
  onCreated: () => void
  onNavigate?: (tab: AppTab, ctx?: NavigateContext) => void
  onDiscard?: () => void
}) {
  const { t } = useTranslation()
  const [profiles, setProfiles] = useState<profile.Profile[]>([])
  const [selectedProfile, setSelectedProfile] = useState(initialDraft?.profileID || '')
  const [inv, setInv] = useState<inventory.Inventory>(EMPTY_INVENTORY)
  const [codexConfigs, setCodexConfigs] = useState<codex.Config[]>([])
  const [dockerConfigs, setDockerConfigs] = useState<docker.Config[]>([])
  const [plugins, setPlugins] = useState<session.PluginInfo[]>([])
  const [selectedHostId, setSelectedHostId] = useState(initialDraft?.hostID || '')
  const [selectedCodexConfigId, setSelectedCodexConfigId] = useState('')
  const [runMode, setRunMode] = useState<string>(initialDraft?.runMode || 'shell')
  const [sessionName, setSessionName] = useState(initialDraft?.sessionName || '')
  const [command, setCommand] = useState(initialDraft?.command || '')
  const [den, setDen] = useState(initialDraft?.den || '')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  // Restore draft from localStorage when modal opens
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mole:newSessionDraft')
      if (saved) {
        const draft = JSON.parse(saved)
        if (draft.profileID) setSelectedProfile(draft.profileID)
        if (draft.runMode) setRunMode(draft.runMode)
        if (draft.hostID) setSelectedHostId(draft.hostID)
        if (draft.command) setCommand(draft.command)
        if (draft.sessionName) setSessionName(draft.sessionName)
        if (draft.den) setDen(draft.den)
        localStorage.removeItem('mole:newSessionDraft')
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListProfiles()
        .then(p => {
          setProfiles(p || [])
          if (!initialDraft?.profileID && p && p.length > 0) {
            setSelectedProfile(p[0].id)
          }
        })
        .catch(err => setError(String(err)))

      GetInventory()
        .then(data => setInv(data || EMPTY_INVENTORY))
        .catch(() => {})

      const listCodexConfigs = getAppMethod('ListCodexConfigs')
      if (typeof listCodexConfigs === 'function') {
        listCodexConfigs()
          .then((configs: codex.Config[]) => {
            setCodexConfigs(configs || [])
            if (configs && configs.length > 0) setSelectedCodexConfigId(configs[0].id)
          })
          .catch(() => {})
      }

      const listDockerConfigs = getAppMethod('ListDockerConfigs')
      if (typeof listDockerConfigs === 'function') {
        listDockerConfigs()
          .then((configs: docker.Config[]) => setDockerConfigs(configs || []))
          .catch(() => {})
      }

      const listLaunchPlugins = getAppMethod('ListLaunchPlugins')
      if (typeof listLaunchPlugins === 'function') {
        listLaunchPlugins()
          .then((infos: session.PluginInfo[]) => setPlugins(infos || []))
          .catch(() => {})
      }
    }
  }, [])

  const hostMap = useMemo(() => {
    const map = new Map<string, inventory.Host>()
    inv.hosts.forEach(h => map.set(h.id, h))
    return map
  }, [inv.hosts])

  const sortedProfiles = useMemo(() => (
    [...profiles].sort((a, b) => compareAlpha(profileLabel(a), profileLabel(b)))
  ), [profiles])

  const sortedHosts = useMemo(() => (
    [...inv.hosts].sort((a, b) => compareAlpha(hostLabel(a), hostLabel(b)))
  ), [inv.hosts])

  const sortedCodexConfigs = useMemo(() => (
    [...codexConfigs].sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [codexConfigs])

  const sortedDockerConfigs = useMemo(() => (
    [...dockerConfigs].sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [dockerConfigs])

  const selectedHost = selectedHostId ? hostMap.get(selectedHostId) : null
  const hostCommand = selectedHost ? buildSSHCommand(selectedHost, inv.defaults, hostMap) : ''

  useEffect(() => {
    if (runMode === 'shell') {
      setSelectedHostId('')
      setSelectedCodexConfigId('')
      setCommand('')
      return
    }

    if (runMode === 'host') {
      if (!selectedHostId && inv.hosts.length > 0) {
        const firstHost = inv.hosts[0]
        setSelectedHostId(firstHost.id)
        const nextCommand = buildSSHCommand(firstHost, inv.defaults, hostMap)
        setCommand(nextCommand)
      } else if (selectedHost && hostCommand) {
        setCommand(hostCommand)
      }
      return
    }

    if (runMode === 'custom') {
      setSelectedHostId('')
      setSelectedCodexConfigId('')
    }

    if (runMode === 'codex') {
      setSelectedHostId('')
      setCommand('')
      if (!selectedCodexConfigId && sortedCodexConfigs.length > 0) {
        setSelectedCodexConfigId(sortedCodexConfigs[0].id)
      }
    }

    if (runMode === 'docker') {
      setSelectedHostId('')
      setCommand('')
      if (!selectedCodexConfigId && sortedDockerConfigs.length > 0) {
        setSelectedCodexConfigId(sortedDockerConfigs[0].id)
      }
    }
  }, [runMode, inv.hosts, selectedHostId, selectedHost, hostCommand, inv.defaults, hostMap, selectedCodexConfigId, sortedCodexConfigs, sortedDockerConfigs])

  const isDuplicating = Boolean(initialDraft)
  const modalTitle = isDuplicating
    ? `${t('burrows.modal.copyTitle')}${initialDraft?.sourceName ? `: ${initialDraft.sourceName}` : ''}`
    : t('burrows.modal.newTitle')
  const modalDescription = isDuplicating
    ? t('burrows.modal.copyDesc')
    : t('burrows.modal.newDesc')
  const submitLabel = creating
    ? (isDuplicating ? t('burrows.modal.creatingCopy') : t('burrows.modal.creating'))
    : (isDuplicating ? t('burrows.modal.createCopy') : t('burrows.modal.create'))

  const handleCreate = async () => {
    if (!selectedProfile || !sessionName.trim()) return
    if (runMode === 'host' && !selectedHostId) {
      setError(t('burrows.modal.selectHostRequired'))
      return
    }
    if (runMode === 'codex' && !selectedCodexConfigId) {
      setError(t('burrows.modal.selectCodexRequired'))
      return
    }
    if (runMode === 'docker' && !selectedCodexConfigId) {
      setError(t('burrows.modal.selectDockerRequired'))
      return
    }
    setCreating(true)
    setError('')
    try {
      await createSessionWithOptions(
        selectedProfile,
        sessionName.trim(),
        command.trim(),
        runMode,
        runMode === 'host' ? selectedHostId : '',
        (runMode === 'codex' || runMode === 'docker') ? selectedCodexConfigId : '',
        den.trim(),
      )
      onCreated()
    } catch (err) {
      setError(String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <ModalShell
      title={modalTitle}
      description={modalDescription}
      onClose={() => { onDiscard?.(); onClose() }}
      contentStyle={{ maxWidth: '640px' }}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={() => { onDiscard?.(); onClose() }} variant="ghost">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !selectedProfile || !sessionName.trim()}
          >
            {submitLabel}
          </Button>
        </div>
      )}
    >
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.profile')}</label>

            {profiles.length === 0 ? (
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground flex-1">
                  {t('burrows.modal.noProfiles')}{' '}
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => {
                        const draft = { profileID: selectedProfile, runMode, hostID: selectedHostId, command, sessionName, den }
                        localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                        onClose()
                        onNavigate('profiles', { returnToNewSession: true })
                      }}
                      className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                    >
                      {t('burrows.modal.createOne')}
                    </button>
                  )}
                </p>
                <Button
                  onClick={() => {
                    const draft = { profileID: selectedProfile, runMode, hostID: selectedHostId, command, sessionName, den }
                    localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                    onClose()
                    onNavigate?.('profiles', { returnToNewSession: true })
                  }}
                  variant="outline"
                  size="sm"
                  type="button"
                  className="shrink-0"
                  title={t('burrows.quickCreate.addProfile')}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={t('burrows.modal.selectProfile')} />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedProfiles.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => {
                    const draft = { profileID: selectedProfile, runMode, hostID: selectedHostId, command, sessionName, den }
                    localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                    onClose()
                    onNavigate?.('profiles', { returnToNewSession: true })
                  }}
                  variant="outline"
                  size="icon"
                  type="button"
                  className="h-9 w-9 shrink-0"
                  title={t('burrows.quickCreate.addProfile')}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Start With</label>
            <div className="grid gap-2 sm:grid-cols-4">
              {plugins.filter(p => {
                if (p.requires_host && inv.hosts.length === 0) return false
                if (p.id === 'codex' && codexConfigs.length === 0) return false
                if (p.id === 'docker' && dockerConfigs.length === 0) return false
                return true
              }).map(p => (
                <RunModeOption
                  key={p.id}
                  mode={p.id}
                  labelKey={p.label_key}
                  activeMode={runMode}
                  onSelect={setRunMode}
                />
              ))}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {(() => { const p = plugins.find(pl => pl.id === runMode); return p ? t(p.hint_key) : '' })()}
            </div>
          </div>

          {runMode === 'host' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.sshHost')}</label>
              {inv.hosts.length === 0 ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground flex-1">
                    {t('burrows.modal.noHosts')}{' '}
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => {
                          const draft = { profileID: selectedProfile, runMode, hostID: selectedHostId, command, sessionName, den }
                          localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                          onClose()
                          onNavigate?.('hosts', { returnToNewSession: true })
                        }}
                        className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                      >
                        {t('burrows.modal.addOne')}
                      </button>
                    )}
                  </p>
                  <Button
                    onClick={() => {
                      const draft = { profileID: selectedProfile, runMode, hostID: selectedHostId, command, sessionName, den }
                      localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                      onClose()
                      onNavigate?.('hosts', { returnToNewSession: true })
                    }}
                    variant="outline"
                    size="sm"
                    type="button"
                    className="shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={selectedHostId || inv.hosts[0]?.id || ''}
                      onValueChange={value => {
                        setSelectedHostId(value)
                        const host = value ? hostMap.get(value) : null
                        const nextCommand = host ? buildSSHCommand(host, inv.defaults, hostMap) : ''
                        setCommand(nextCommand)
                      }}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder={t('burrows.modal.selectHost')} />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedHosts.map(h => (
                          <SelectItem key={h.id} value={h.id}>
                            {h.name || h.host}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => {
                      const draft = { profileID: selectedProfile, runMode, hostID: selectedHostId, command, sessionName, den }
                      localStorage.setItem('mole:newSessionDraft', JSON.stringify(draft))
                      onClose()
                      onNavigate?.('hosts', { returnToNewSession: true })
                    }}
                    variant="outline"
                    size="icon"
                    type="button"
                    className="h-9 w-9 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {selectedHost && hostCommand && (
                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">{t('common.preview')}</div>
                  <CommandText command={hostCommand} />
                </div>
              )}
            </div>
          )}

          {runMode === 'custom' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.command')}</label>
              <textarea
                value={command}
                onChange={e => setCommand(e.target.value)}
                placeholder={t('burrows.modal.commandPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-15 max-h-50"
              />
            </div>
          )}

          {runMode === 'codex' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.codexConfig')}</label>
              {codexConfigs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('burrows.modal.noCodex')}</p>
              ) : (
                <Select value={selectedCodexConfigId} onValueChange={setSelectedCodexConfigId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('burrows.modal.selectCodex')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedCodexConfigs.map(cfg => (
                      <SelectItem key={cfg.id} value={cfg.id}>
                        {cfg.name || cfg.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedCodexConfigId && (
                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                    <Bot className="h-3.5 w-3.5" />
                    {t('burrows.modal.launchPreview')}
                  </div>
                  <div className="font-mono">codex</div>
                </div>
              )}
            </div>
          )}

          {runMode === 'docker' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.dockerConfig')}</label>
              {dockerConfigs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('burrows.modal.noDocker')}</p>
              ) : (
                <Select value={selectedCodexConfigId} onValueChange={setSelectedCodexConfigId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('burrows.modal.selectDocker')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedDockerConfigs.map(cfg => (
                      <SelectItem key={cfg.id} value={cfg.id}>
                        {cfg.name || cfg.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedCodexConfigId && (() => {
                const selectedDockerCfg = dockerConfigs.find(c => c.id === selectedCodexConfigId)
                return selectedDockerCfg ? (
                  <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                      <Box className="h-3.5 w-3.5" />
                      {t('burrows.modal.launchPreview')}
                    </div>
                    <div className="font-mono">{['docker', 'run', '-it', '--rm', '-v', '${HOME}:/host/home', selectedDockerCfg.image].join(' ')}</div>
                  </div>
                ) : null
              })()}
            </div>
          )}

          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.burrowName')}</label>
            <input
              type="text"
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder={t('burrows.modal.namePlaceholder')}
              pattern="[a-zA-Z0-9_-]+"
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('burrows.modal.nameHint')}</p>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.den')}</label>
            <input
              type="text"
              value={den}
              onChange={e => setDen(e.target.value)}
              placeholder={t('burrows.modal.denPlaceholder')}
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('burrows.modal.denHint')}</p>
          </div>
      </div>
    </ModalShell>
  )
}

function EditSessionModal({
  session: initialSession,
  onClose,
  onUpdated,
}: {
  session: SessionRecord
  onClose: () => void
  onUpdated: () => void
}) {
  const { t } = useTranslation()
  const [profiles, setProfiles] = useState<profile.Profile[]>([])
  const [selectedProfile, setSelectedProfile] = useState(initialSession.profile_id)
  const [command, setCommand] = useState(initialSession.command || '')
  const [inv, setInv] = useState<inventory.Inventory>(EMPTY_INVENTORY)
  const [codexConfigs, setCodexConfigs] = useState<codex.Config[]>([])
  const [dockerConfigs, setDockerConfigs] = useState<docker.Config[]>([])
  const [plugins, setPlugins] = useState<session.PluginInfo[]>([])
  const [selectedHostId, setSelectedHostId] = useState('')
  const [selectedCodexConfigId, setSelectedCodexConfigId] = useState(initialSession.codex_config_id || '')
  const [runMode, setRunMode] = useState<string>(
    normalizeRunMode(initialSession.run_mode, Boolean(initialSession.command))
  )
  const [den, setDen] = useState(initialSession.den || '')
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListProfiles()
        .then(p => setProfiles(p || []))
        .catch(err => setError(String(err)))

      GetInventory()
        .then(data => {
          setInv(data || EMPTY_INVENTORY)
          setHydrated(true)
        })
        .catch(() => setHydrated(true))

      const listCodexConfigs = getAppMethod('ListCodexConfigs')
      if (typeof listCodexConfigs === 'function') {
        listCodexConfigs()
          .then((configs: codex.Config[]) => setCodexConfigs(configs || []))
          .catch(() => {})
      }

      const listLaunchPlugins = getAppMethod('ListLaunchPlugins')
      if (typeof listLaunchPlugins === 'function') {
        listLaunchPlugins()
          .then((infos: session.PluginInfo[]) => setPlugins(infos || []))
          .catch(() => {})
      }

      const listDockerConfigs = getAppMethod('ListDockerConfigs')
      if (typeof listDockerConfigs === 'function') {
        listDockerConfigs()
          .then((configs: docker.Config[]) => setDockerConfigs(configs || []))
          .catch(() => {})
      }
    }
  }, [])

  const hostMap = useMemo(() => {
    const map = new Map<string, inventory.Host>()
    inv.hosts.forEach(h => map.set(h.id, h))
    return map
  }, [inv.hosts])

  const sortedProfiles = useMemo(() => (
    [...profiles].sort((a, b) => compareAlpha(profileLabel(a), profileLabel(b)))
  ), [profiles])

  const sortedHosts = useMemo(() => (
    [...inv.hosts].sort((a, b) => compareAlpha(hostLabel(a), hostLabel(b)))
  ), [inv.hosts])

  const sortedCodexConfigs = useMemo(() => (
    [...codexConfigs].sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [codexConfigs])

  const sortedDockerConfigs = useMemo(() => (
    [...dockerConfigs].sort((a, b) => compareAlpha(a.name || a.id, b.name || b.id))
  ), [dockerConfigs])

  const selectedHost = selectedHostId ? hostMap.get(selectedHostId) : null
  const hostCommand = selectedHost ? buildSSHCommand(selectedHost, inv.defaults, hostMap) : ''

  useEffect(() => {
    if (!hydrated) return

    if (initialSession.run_mode === 'host' && initialSession.host_id) {
      setRunMode('host')
      setSelectedHostId(initialSession.host_id)
      const host = hostMap.get(initialSession.host_id)
      setCommand(host ? buildSSHCommand(host, inv.defaults, hostMap) : initialSession.command || '')
      return
    }

    if (initialSession.run_mode === 'codex' && initialSession.codex_config_id) {
      setRunMode('codex')
      setSelectedCodexConfigId(initialSession.codex_config_id)
      setCommand('')
      return
    }

    const matchingHostID = findHostIDForCommand(initialSession.command || '', inv, hostMap)
    if (matchingHostID) {
      setRunMode('host')
      setSelectedHostId(matchingHostID)
      setCommand(initialSession.command || '')
      return
    }

    if ((initialSession.command || '').trim()) {
      setRunMode('custom')
      setCommand(initialSession.command || '')
      return
    }

    setRunMode('shell')
    setCommand('')
  }, [hydrated, initialSession.command, initialSession.host_id, initialSession.run_mode, inv, hostMap])

  useEffect(() => {
    if (runMode === 'shell') {
      setSelectedHostId('')
      setSelectedCodexConfigId('')
      setCommand('')
      return
    }

    if (runMode === 'host') {
      if (!selectedHostId && inv.hosts.length > 0) {
        const firstHost = inv.hosts[0]
        setSelectedHostId(firstHost.id)
        setCommand(buildSSHCommand(firstHost, inv.defaults, hostMap))
        return
      }

      if (selectedHost && hostCommand) {
        setCommand(hostCommand)
      }
      return
    }

    if (runMode === 'custom') {
      setSelectedHostId('')
      setSelectedCodexConfigId('')
    }

    if (runMode === 'codex') {
      setSelectedHostId('')
      setCommand('')
      if (!selectedCodexConfigId && sortedCodexConfigs.length > 0) {
        setSelectedCodexConfigId(sortedCodexConfigs[0].id)
      }
    }

    if (runMode === 'docker') {
      setSelectedHostId('')
      setCommand('')
      if (!selectedCodexConfigId && sortedDockerConfigs.length > 0) {
        setSelectedCodexConfigId(sortedDockerConfigs[0].id)
      }
    }
  }, [runMode, selectedHostId, selectedHost, hostCommand, inv.hosts, inv.defaults, hostMap, selectedCodexConfigId, sortedCodexConfigs, sortedDockerConfigs])

  const handleUpdate = async () => {
    if (!selectedProfile) return
    if (runMode === 'host' && !selectedHostId) {
      setError(t('burrows.modal.selectHostRequiredEdit'))
      return
    }
    if (runMode === 'codex' && !selectedCodexConfigId) {
      setError(t('burrows.modal.selectCodexRequiredEdit'))
      return
    }
    if (runMode === 'docker' && !selectedCodexConfigId) {
      setError(t('burrows.modal.selectDockerRequiredEdit'))
      return
    }
    setUpdating(true)
    setError('')
    try {
      await updateSessionWithOptions(
        initialSession.id,
        selectedProfile,
        command.trim(),
        runMode,
        runMode === 'host' ? selectedHostId : '',
        (runMode === 'codex' || runMode === 'docker') ? selectedCodexConfigId : '',
        den.trim(),
      )
      onUpdated()
    } catch (err) {
      setError(String(err))
    } finally {
      setUpdating(false)
    }
  }

  return (
    <ModalShell
      title={t('burrows.edit.title', { name: initialSession.name })}
      description={t('burrows.edit.desc')}
      onClose={onClose}
      contentStyle={{ maxWidth: '640px' }}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={updating || !selectedProfile}
          >
            {updating ? t('burrows.edit.saving') : t('burrows.edit.saveRestart')}
          </Button>
        </div>
      )}
    >
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.profile')}</label>
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('burrows.edit.loadingProfiles')}</p>
            ) : (
              <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={t('burrows.modal.selectProfile')} />
                </SelectTrigger>
                <SelectContent>
                  {sortedProfiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Start With</label>
            <div className="grid gap-2 sm:grid-cols-4">
              {plugins.filter(p => {
                if (p.requires_host && inv.hosts.length === 0) return false
                if (p.id === 'codex' && codexConfigs.length === 0) return false
                if (p.id === 'docker' && dockerConfigs.length === 0) return false
                return true
              }).map(p => (
                <RunModeOption
                  key={p.id}
                  mode={p.id}
                  labelKey={p.label_key}
                  activeMode={runMode}
                  onSelect={setRunMode}
                />
              ))}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {(() => { const p = plugins.find(pl => pl.id === runMode); return p ? t(p.hint_key) : '' })()}
            </div>
          </div>

          {runMode === 'host' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.sshHost')}</label>
              {inv.hosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('burrows.edit.noHostsInline')}</p>
              ) : (
                <Select
                  value={selectedHostId || ''}
                  onValueChange={value => {
                    setSelectedHostId(value)
                    const host = hostMap.get(value)
                    const nextCommand = host ? buildSSHCommand(host, inv.defaults, hostMap) : ''
                    setCommand(nextCommand)
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('burrows.modal.selectHost')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedHosts.map(h => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name || h.host}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedHost && hostCommand && (
                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">{t('common.preview')}</div>
                  <CommandText command={hostCommand} />
                </div>
              )}
            </div>
          )}

          {runMode === 'custom' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.command')}</label>
              <textarea
                value={command}
                onChange={e => setCommand(e.target.value)}
                placeholder={t('burrows.modal.commandPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm font-mono placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-15 max-h-50"
              />
            </div>
          )}

          {runMode === 'codex' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.codexConfig')}</label>
              {codexConfigs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('burrows.modal.noCodex')}</p>
              ) : (
                <Select value={selectedCodexConfigId} onValueChange={setSelectedCodexConfigId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('burrows.modal.selectCodex')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedCodexConfigs.map(cfg => (
                      <SelectItem key={cfg.id} value={cfg.id}>
                        {cfg.name || cfg.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedCodexConfigId && (
                <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                    <Bot className="h-3.5 w-3.5" />
                    {t('burrows.modal.launchPreview')}
                  </div>
                  <div className="font-mono">codex</div>
                </div>
              )}
            </div>
          )}

          {runMode === 'docker' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.dockerConfig')}</label>
              {dockerConfigs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('burrows.modal.noDocker')}</p>
              ) : (
                <Select value={selectedCodexConfigId} onValueChange={setSelectedCodexConfigId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('burrows.modal.selectDocker')} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedDockerConfigs.map(cfg => (
                      <SelectItem key={cfg.id} value={cfg.id}>
                        {cfg.name || cfg.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedCodexConfigId && (() => {
                const selectedDockerCfg = dockerConfigs.find(c => c.id === selectedCodexConfigId)
                return selectedDockerCfg ? (
                  <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                      <Box className="h-3.5 w-3.5" />
                      {t('burrows.modal.launchPreview')}
                    </div>
                    <div className="font-mono">{['docker', 'run', '-it', '--rm', '-v', '${HOME}:/host/home', selectedDockerCfg.image].join(' ')}</div>
                  </div>
                ) : null
              })()}
            </div>
          )}

          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('burrows.modal.den')}</label>
            <input
              type="text"
              value={den}
              onChange={e => setDen(e.target.value)}
              placeholder={t('burrows.modal.denPlaceholder')}
              className="w-full px-3 py-2 bg-background border border-input rounded text-foreground text-sm placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('burrows.modal.denHint')}</p>
          </div>
      </div>
    </ModalShell>
  )
}

export default Sessions
