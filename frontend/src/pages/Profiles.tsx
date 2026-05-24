import { useState, useEffect, useCallback, useMemo } from 'react'
import { ListProfiles, SaveProfile, GetProviderPresets } from '../../wailsjs/go/main/App'
import { ClipboardSetText, BrowserOpenURL } from '../../wailsjs/runtime/runtime'
import { profile } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DangerConfirmModal } from "@/components/ui/danger-confirm-modal"
import { ModalShell } from "@/components/ui/modal-shell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from '@/lib/utils'
import { useTranslation } from "@/i18n/context"
import { Plus, Pencil, Trash2, Upload, X, Check, Copy, ArrowLeft, Search, ExternalLink } from "lucide-react"
import { type ProviderPreset } from '@/lib/profile-templates'

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
]

const ENV_VAR_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const ENV_VAR_KEY_RULES = 'Use letters, digits, and underscores, and do not start with a digit.'
const ENV_VAR_KEY_DUPLICATE = 'Variable names must be unique within a profile.'
const ENV_VAR_KEY_HINT = 'Recommended: UPPER_SNAKE_CASE. Lowercase is allowed and Mole preserves case.'

const normalizeEnvKey = (key: string) => key.trim()

const compareByLabel = (left: string, right: string) => (
  left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true })
)

const buildDuplicateProfileName = (baseName: string, existingNames: string[]) => {
  const normalizedBase = baseName.trim() || 'profile'
  const candidateBase = `${normalizedBase}-copy`
  const usedNames = new Set(existingNames.map(name => name.trim().toLowerCase()).filter(Boolean))

  if (!usedNames.has(candidateBase.toLowerCase())) {
    return candidateBase
  }

  let index = 2
  while (usedNames.has(`${candidateBase}-${index}`.toLowerCase())) {
    index += 1
  }

  return `${candidateBase}-${index}`
}

type ProfileDeleteReference = {
  session_id?: string
  name?: string
}

type ProfileDeleteResponse = {
  deleted?: boolean
  code?: string
  message?: string
  references?: ProfileDeleteReference[]
}

function Profiles({
  refreshSignal,
  onCreated,
  onBack,
}: {
  refreshSignal?: number
  onCreated?: () => void
  onBack?: () => void
}) {
  const { t } = useTranslation()
  const [profiles, setProfiles] = useState<profile.Profile[]>([])
  const [editingProfile, setEditingProfile] = useState<profile.Profile | null>(null)
  const [viewingProfile, setViewingProfile] = useState<profile.Profile | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<profile.Profile | null>(null)

  const refresh = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      ListProfiles()
        .then(p => setProfiles(p || []))
        .catch(err => setError(String(err)))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh, refreshSignal])

  const handleNew = () => {
    setEditingProfile(new profile.Profile({
      id: '',
      name: '',
      description: '',
      color: PRESET_COLORS[0],
      default_command: '',
      env_vars: {},
      secret_keys: [],
    }))
    setIsNew(true)
  }

  const handleEdit = (p: profile.Profile) => {
    setEditingProfile(p)
    setIsNew(false)
  }

  const handleView = (p: profile.Profile) => {
    setViewingProfile(p)
  }

  const handleDuplicate = (p: profile.Profile) => {
    setEditingProfile(new profile.Profile({
      id: '',
      name: buildDuplicateProfileName(
        p.name || '',
        profiles.map(item => item.name || '')
      ),
      description: p.description || '',
      color: p.color || PRESET_COLORS[0],
      default_command: p.default_command || '',
      env_vars: { ...(p.env_vars || {}) },
      secret_keys: [...(p.secret_keys || [])],
    }))
    setIsNew(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const method = (window as any)?.go?.main?.App?.DeleteProfile
      if (typeof method !== 'function') {
        setError(t('profiles.delete.unavailable'))
        return
      }

      const result = await method(id) as ProfileDeleteResponse | undefined
      if (result?.deleted === false && result?.code === 'PROFILE_IN_USE') {
        const names = (result.references || [])
          .map(item => (item.name || '').trim())
          .filter(Boolean)
          .slice(0, 8)
        const refs = names.join(', ')
        setError(t('profiles.delete.inUse', {
          refs: refs || t('profiles.delete.inUseUnknown'),
        }))
        return
      }

      refresh()
    } catch (err) {
      setError(String(err))
    }
  }

  const requestDelete = (target: profile.Profile) => {
    setPendingDeleteProfile(target)
  }

  const handleSave = () => {
    setEditingProfile(null)
    refresh()
    onCreated?.()
  }

  const sortedProfiles = useMemo(() => (
    [...profiles].sort((a, b) => compareByLabel(a.name || '', b.name || ''))
  ), [profiles])

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return sortedProfiles

    return sortedProfiles.filter((item) => {
      const keys = Object.keys(item.env_vars || {})
      return (item.name || '').toLowerCase().includes(query)
        || (item.description || '').toLowerCase().includes(query)
        || keys.some(key => key.toLowerCase().includes(query))
    })
  }, [search, sortedProfiles])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="surface-panel flex flex-col gap-3 rounded-2xl border border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button onClick={onBack} variant="ghost" size="sm" className="h-8 w-8 rounded-xl p-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <h1 className="text-xl font-semibold text-foreground">{t('profiles.title')}</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('profiles.searchPlaceholder')}
              className="h-9 rounded-xl border-border bg-background/80 pl-10 pr-10"
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
          <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
            {t('profiles.summary', { filtered: filteredProfiles.length, total: profiles.length })}
          </span>
          <Button onClick={handleNew} size="sm" className="shadow-sm">
            <Plus className="w-4 h-4" />
            {t('profiles.addProfile')}
          </Button>
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

      <div className="app-scroll min-h-0 flex-1 overflow-auto pr-1">
        {profiles.length === 0 ? (
          <div className="surface-panel rounded-2xl border border-border bg-muted/15 px-6 py-12 text-center text-muted-foreground">
            {t('profiles.empty')}
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="surface-panel rounded-2xl border border-border bg-muted/15 px-6 py-12 text-center text-muted-foreground">
            {t('profiles.noFilterMatch')}
          </div>
        ) : (
          <div className="grid gap-3 pb-2">
            {filteredProfiles.map(p => (
              <ProfileCard
                key={p.id}
                profile={p}
                onView={handleView}
                onDuplicate={handleDuplicate}
                onEdit={handleEdit}
                onDelete={requestDelete}
              />
            ))}
          </div>
        )}
      </div>

      {editingProfile && (
        <ProfileForm
          profile={editingProfile}
          isNew={isNew}
          onSave={handleSave}
          onCancel={() => setEditingProfile(null)}
        />
      )}

      {viewingProfile && (
        <ViewProfileModal
          profile={viewingProfile}
          onClose={() => setViewingProfile(null)}
        />
      )}

      <DangerConfirmModal
        open={Boolean(pendingDeleteProfile)}
        title={t('profiles.delete.confirmTitle')}
        description={t('profiles.delete.confirmDesc', { name: pendingDeleteProfile?.name || '' })}
        impactText={t('profiles.delete.confirmImpact')}
        ackLabel={t('profiles.delete.confirmAck')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setPendingDeleteProfile(null)}
        onConfirm={async () => {
          const target = pendingDeleteProfile
          if (!target) return
          await handleDelete(target.id)
          setPendingDeleteProfile(null)
        }}
      />
    </div>
  )
}

function ProfileCard({
  profile: p,
  onView,
  onDuplicate,
  onEdit,
  onDelete,
}: {
  profile: profile.Profile
  onView: (p: profile.Profile) => void
  onDuplicate: (p: profile.Profile) => void
  onEdit: (p: profile.Profile) => void
  onDelete: (p: profile.Profile) => void
}) {
  const { t } = useTranslation()
  const envCount = Object.keys(p.env_vars || {}).length
  const secretCount = (p.secret_keys || []).length

  return (
    <div className="breathing-card surface-panel flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 transition-all md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div
            className="mt-1 h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: p.color || '#6B7280' }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate font-medium text-foreground">{p.name}</div>
              <span className="rounded-full border border-border/80 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {t('profiles.card.varCount', { count: envCount })}
              </span>
              {secretCount > 0 && (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {t('profiles.card.secretCount', { count: secretCount })}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              {p.description || t('profiles.card.noDescription')}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 md:shrink-0 md:justify-end">
        <Button onClick={() => onDuplicate(p)} variant="outline" size="sm" title={t('common.duplicate')}>
          <Copy className="w-3.5 h-3.5" />
          {t('common.duplicate')}
        </Button>
        <Button onClick={() => onView(p)} variant="ghost" size="sm" title={t('profiles.card.viewCopy')}>
          {t('profiles.card.view')}
        </Button>
        <Button onClick={() => onEdit(p)} variant="secondary" size="sm">
          <Pencil className="w-3.5 h-3.5" />
          {t('common.edit')}
        </Button>
        <Button onClick={() => onDelete(p)} variant="destructive" size="sm">
          <Trash2 className="w-3.5 h-3.5" />
          {t('common.delete')}
        </Button>
      </div>
    </div>
  )
}

interface EnvEntry {
  key: string
  value: string
  isSecret: boolean
}

function ProfileForm({
  profile: initial,
  isNew,
  onSave,
  onCancel,
}: {
  profile: profile.Profile
  isNew: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const { t, language } = useTranslation()
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [defaultCommand, setDefaultCommand] = useState(initial.default_command || '')
  const [color, setColor] = useState(initial.color || PRESET_COLORS[0])
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>(() => {
    const entries: EnvEntry[] = []
    const secretKeys = new Set(initial.secret_keys || [])

    // Load all env vars (secrets are now also in env_vars)
    for (const [key, value] of Object.entries(initial.env_vars || {})) {
      entries.push({
        key,
        value,
        isSecret: secretKeys.has(key) // Mark as secret if in secret_keys list
      })
    }

    return entries
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [selectedTemplateID, setSelectedTemplateID] = useState('custom')

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).go) {
      GetProviderPresets().then(setPresets).catch(() => {})
    }
  }, [])

  const envEntryIssues = useMemo(() => {
    const issues = new Map<number, string[]>()
    const indexesByKey = new Map<string, number[]>()

    envEntries.forEach((entry, idx) => {
      const key = normalizeEnvKey(entry.key)
      if (!key) return

      if (!ENV_VAR_KEY_PATTERN.test(key)) {
        issues.set(idx, [ENV_VAR_KEY_RULES])
      }

      const indexes = indexesByKey.get(key) ?? []
      indexes.push(idx)
      indexesByKey.set(key, indexes)
    })

    indexesByKey.forEach((indexes) => {
      if (indexes.length < 2) return

      indexes.forEach((index) => {
        const messages = issues.get(index) ?? []
        issues.set(index, [...messages, ENV_VAR_KEY_DUPLICATE])
      })
    })

    return issues
  }, [envEntries])

  const selectedPreset = useMemo(() => {
    const found = presets.find(p => p.id === selectedTemplateID)
    if (found) return found
    return presets.length > 0 ? presets[presets.length - 1] : null
  }, [selectedTemplateID, presets])

  const hasMeaningfulContent = name.trim() || description.trim() || defaultCommand.trim() || envEntries.some(entry => normalizeEnvKey(entry.key) || entry.value)

  const applyPreset = (preset: ProviderPreset) => {
    setSelectedTemplateID(preset.id)
    setError('')
    setEnvEntries(preset.entries.map(entry => ({
      key: entry.key,
      value: entry.value,
      isSecret: entry.isSecret,
    })))
    if (isNew && !description.trim()) {
      setDescription(preset.id === 'custom' ? '' : (language === 'zh' ? preset.descriptionZh : preset.descriptionEn))
    }
  }

  const addEntry = () => {
    setError('')
    setEnvEntries([...envEntries, { key: '', value: '', isSecret: false }])
  }

  const removeEntry = (idx: number) => {
    setError('')
    setEnvEntries(envEntries.filter((_, i) => i !== idx))
  }

  const updateEntry = (idx: number, field: keyof EnvEntry, value: string | boolean) => {
    setError('')
    const updated = [...envEntries]
    updated[idx] = { ...updated[idx], [field]: value }
    setEnvEntries(updated)
  }

  const handleBulkImport = (text: string) => {
    const newEntries: EnvEntry[] = []
    const normalizeValue = (raw: string) => {
      let value = raw.trim()
      value = value.replace(/,\s*$/, '')
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      return value
    }

    const isValidEnvKey = (key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)

    const appendJsonObjectEntries = (obj: unknown) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
      let appended = false
      for (const [rawKey, rawValue] of Object.entries(obj as Record<string, unknown>)) {
        const key = rawKey.trim()
        if (!isValidEnvKey(key)) continue
        if (typeof rawValue === 'string') {
          newEntries.push({ key, value: rawValue, isSecret: false })
          appended = true
          continue
        }
        if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
          newEntries.push({ key, value: String(rawValue), isSecret: false })
          appended = true
        }
      }
      return appended
    }

    const wholeText = text.trim()
    if (wholeText) {
      try {
        const parsed = JSON.parse(wholeText)
        if (appendJsonObjectEntries(parsed)) {
          // JSON object parsed successfully, skip line-by-line fallback.
        } else {
          // Fallback to line parser when JSON shape is unsupported.
          throw new Error('unsupported json shape')
        }
      } catch {
        const lines = text.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#') || trimmed === '{' || trimmed === '}') continue

          // Try export format: export KEY=value or export KEY="value"
          const exportMatch = trimmed.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
          if (exportMatch) {
            const key = exportMatch[1]
            const value = normalizeValue(exportMatch[2])
            newEntries.push({ key, value, isSecret: false })
            continue
          }

          // Try simple format: KEY=value or KEY="value"
          const simpleMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
          if (simpleMatch) {
            const key = simpleMatch[1]
            const value = normalizeValue(simpleMatch[2])
            newEntries.push({ key, value, isSecret: false })
            continue
          }

          // Try colon format: KEY: value / "KEY": "value",
          const colonMatch = trimmed.match(/^"?([A-Za-z_][A-Za-z0-9_]*)"?\s*:\s*(.*)$/)
          if (colonMatch) {
            const key = colonMatch[1]
            const value = normalizeValue(colonMatch[2])
            newEntries.push({ key, value, isSecret: false })
            continue
          }
        }
      }
    }

    // Merge with existing entries (avoid duplicates)
    const existingKeys = new Set(
      envEntries
        .map(entry => normalizeEnvKey(entry.key))
        .filter(Boolean)
    )
    const merged = [...envEntries]
    for (const entry of newEntries) {
      const key = normalizeEnvKey(entry.key)
      if (!key || existingKeys.has(key)) continue

      existingKeys.add(key)
      merged.push({ ...entry, key })
    }

    setError('')
    setEnvEntries(merged)
    setShowBulkImport(false)
  }

  const handleSubmit = async () => {
    if (!name.trim()) return

    if (envEntryIssues.size > 0) {
      setError(t('profiles.form.fixErrors'))
      return
    }

    setError('')
    setSaving(true)

    try {
      const envVars: Record<string, string> = {}
      const secretKeys: string[] = []
      const secrets: Record<string, string> = {}

      for (const entry of envEntries) {
        const key = normalizeEnvKey(entry.key)
        if (!key) continue

        if (entry.isSecret) {
          secretKeys.push(key)
          if (entry.value) {
            secrets[key] = entry.value
          }
        } else {
          envVars[key] = entry.value
        }
      }

      const p = new profile.Profile({
        id: initial.id,
        name: name.trim(),
        description: description.trim(),
        color,
        default_command: defaultCommand.trim(),
        env_vars: envVars,
        secret_keys: secretKeys,
      })

      await SaveProfile(p, secrets)
      onSave()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ModalShell
        title={isNew ? t('profiles.form.newTitle') : t('profiles.form.editTitle', { name: initial.name })}
        description={t('profiles.form.desc')}
        onClose={onCancel}
        contentClassName="max-w-[920px]"
        footer={(
          <div className="flex justify-end gap-2">
            <Button onClick={onCancel} variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || !name.trim() || envEntryIssues.size > 0}
            >
              {saving ? t('profiles.form.saving') : t('common.save')}
            </Button>
          </div>
        )}
      >
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('profiles.form.template')}</label>
              <Select
                value={selectedTemplateID}
                onValueChange={value => {
                  const preset = presets.find(p => p.id === value)
                  if (preset) applyPreset(preset)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('profiles.form.template')} />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {presets.map(preset => (
                    <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPreset?.link && (
                <a
                  className="inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary hover:underline transition-colors mt-1"
                  onClick={(e) => { e.preventDefault(); BrowserOpenURL(selectedPreset!.link!) }}
                  role="link"
                  tabIndex={0}
                >
                  {t('profiles.form.providerLink')}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">{t('common.name')}</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Maxx Proxy"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('common.description')}</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('common.description')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('profiles.form.defaultCommand')}</label>
            <input
              type="text"
              value={defaultCommand}
              onChange={e => setDefaultCommand(e.target.value)}
              placeholder={t('profiles.form.defaultCommandPlaceholder')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('profiles.form.defaultCommandHint')}</p>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">{t('profiles.form.color')}</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring ${
                    color === c ? 'border-foreground shadow-sm' : 'border-border'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                >
                  {color === c && (
                    <Check className="h-4 w-4 text-white drop-shadow-md" strokeWidth={3} />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/10 p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <label className="text-sm font-medium text-foreground">{t('profiles.form.envVars')}</label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('profiles.form.envVarsHint')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ENV_VAR_KEY_HINT}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowBulkImport(true)}
                  variant="ghost"
                  size="sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {t('profiles.form.bulkImport')}
                </Button>
                <Button
                  onClick={addEntry}
                  variant="secondary"
                  size="sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('profiles.form.addVariable')}
                </Button>
              </div>
            </div>

            {envEntries.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t('profiles.form.noVars')}</p>
            ) : (
              <div className="space-y-2">
                {envEntries.map((entry, idx) => {
                  const issueMessages = envEntryIssues.get(idx) ?? []
                  const hasIssues = issueMessages.length > 0

                  return (
                    <div key={idx} className="space-y-2">
                      <div className="grid gap-2 rounded-lg border border-border/70 bg-background/80 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                        <input
                          type="text"
                          value={entry.key}
                          onChange={e => updateEntry(idx, 'key', e.target.value)}
                          placeholder="OPENAI_API_KEY"
                          className={cn(
                            'w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring',
                            hasIssues && 'border-destructive/60 focus:ring-destructive'
                          )}
                        />
                        <input
                          type={entry.isSecret ? 'password' : 'text'}
                          value={entry.value}
                          onChange={e => updateEntry(idx, 'value', e.target.value)}
                          placeholder={entry.isSecret ? t('profiles.form.secretPlaceholder') : t('profiles.form.valuePlaceholder')}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-muted/20 px-3 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={entry.isSecret}
                            onChange={e => updateEntry(idx, 'isSecret', e.target.checked)}
                            className="rounded"
                          />
                          {t('profiles.form.secret')}
                        </label>
                        <Button
                          onClick={() => removeEntry(idx)}
                          variant="ghost"
                          size="sm"
                          className="h-11 w-11 p-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {hasIssues && (
                        <p className="px-1 text-xs text-destructive">
                          {issueMessages.join(' ')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </ModalShell>

      {showBulkImport && (
        <BulkImportModal
          onImport={handleBulkImport}
          onClose={() => setShowBulkImport(false)}
        />
      )}
    </>
  )
}

function BulkImportModal({
  onImport,
  onClose,
}: {
  onImport: (text: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  return (
    <ModalShell
      title={t('profiles.bulkImport.title')}
      description={t('profiles.bulkImport.desc')}
      onClose={onClose}
      overlayClassName="z-[110]"
      contentClassName="max-w-[520px]"
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => onImport(text)}
            disabled={!text.trim()}
          >
            {t('common.import')}
          </Button>
        </div>
      )}
    >
      <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
        <p className="mb-2">{t('profiles.bulkImport.formats')}</p>
        <div className="space-y-1 rounded-md bg-background px-3 py-2 font-mono text-xs text-foreground">
          <div>export KEY=value</div>
          <div>KEY=value</div>
          <div>KEY: value</div>
          <div>KEY="quoted value"</div>
          <div>{`{"KEY": "value", "KEY2": "value2"}`}</div>
        </div>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={t('profiles.bulkImport.placeholder')}
        rows={8}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-[hsl(var(--placeholder))] placeholder:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </ModalShell>
  )
}

function ViewProfileModal({
  profile: p,
  onClose,
}: {
  profile: profile.Profile
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  // Generate export format text
  const generateExportText = () => {
    const lines: string[] = []
    lines.push(`# Profile: ${p.name}`)
    if (p.description) {
      lines.push(`# ${p.description}`)
    }
    lines.push('')

    // Add all env vars (secrets are also in env_vars now)
    for (const [key, value] of Object.entries(p.env_vars || {})) {
      // Escape single quotes in value
      const escapedValue = value.replace(/'/g, "'\\''")
      lines.push(`export ${key}='${escapedValue}'`)
    }

    return lines.join('\n')
  }

  const handleCopy = async () => {
    const text = generateExportText()
    await ClipboardSetText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const envCount = Object.keys(p.env_vars || {}).length
  const secretCount = (p.secret_keys || []).length

  return (
    <ModalShell
      title={p.name}
      description={p.description || t('profiles.view.desc')}
      onClose={onClose}
      contentClassName="max-w-[920px]"
      headerSlot={(
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: p.color || '#6B7280' }}
          />
          <span>
            {t('profiles.view.variableCount', { count: envCount })}
            {secretCount > 0 && `, ${t('profiles.view.secretCount', { count: secretCount })} ${t('profiles.view.secrets')}`}
          </span>
        </div>
      )}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            {t('common.close')}
          </Button>
        </div>
      )}
    >
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <label className="text-sm font-medium text-foreground">{t('profiles.view.envVars')}</label>
          <Button onClick={handleCopy} size="sm" variant="outline">
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                {t('profiles.view.copied')}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                {t('profiles.view.copyAll')}
              </>
            )}
          </Button>
        </div>

        <div className="app-scroll max-h-[26rem] space-y-1 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3 font-mono text-xs text-foreground">
          <div className="text-muted-foreground"># Profile: {p.name}</div>
          {p.description && <div className="text-muted-foreground"># {p.description}</div>}
          <div></div>
          {Object.entries(p.env_vars || {}).map(([key, value]) => {
            const isSecret = (p.secret_keys || []).includes(key)
            return (
              <div key={key} className={isSecret ? 'text-primary' : ''}>
                export {key}='{value}'
              </div>
            )
          })}
        </div>
      </div>
    </ModalShell>
  )
}

export default Profiles
