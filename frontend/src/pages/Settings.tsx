import { useState, useEffect } from 'react'
import { GetInstalledTerminals, GetDefaultTerminal, SetDefaultTerminal } from '../../wailsjs/go/main/App'
import { ClipboardSetText } from '../../wailsjs/runtime/runtime'
import { codex, docker, session, terminal } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { ModalShell } from "@/components/ui/modal-shell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ThemeToggle } from "@/components/theme-toggle"
import { useTranslation, type Language } from "@/i18n/context"
import { Check, Copy, Download, KeyRound, Pencil, Plus, Puzzle, Terminal as TerminalIcon, Trash2, TriangleAlert, Upload, Settings as SettingsIcon, Palette, HardDrive, FileUp, Info } from "lucide-react"

type SettingsTab = 'general' | 'terminal' | 'import' | 'plugins' | 'about'

const SETTINGS_TAB_KEYS: { key: SettingsTab; labelKey: string; icon: typeof SettingsIcon }[] = [
  { key: 'general', labelKey: 'settings.tab.general', icon: Palette },
  { key: 'terminal', labelKey: 'settings.tab.terminal', icon: TerminalIcon },
  { key: 'import', labelKey: 'settings.tab.import', icon: FileUp },
  { key: 'plugins', labelKey: 'settings.tab.plugins', icon: Puzzle },
  { key: 'about', labelKey: 'settings.tab.about', icon: Info },
]

const getAppMethod = (method: string) => {
  return (window as any)?.go?.main?.App?.[method]
}

function Settings({
  onBurrowImported,
}: {
  onBurrowImported?: () => void
}) {
  const { t, language, setLanguage } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [terminals, setTerminals] = useState<terminal.TerminalApp[]>([])
  const [defaultTerminal, setDefaultTerminal] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [burrowBuffer, setBurrowBuffer] = useState('')
  const [burrowBusy, setBurrowBusy] = useState<'export' | 'import' | null>(null)
  const [codexConfigs, setCodexConfigs] = useState<codex.Config[]>([])
  const [codexModal, setCodexModal] = useState<{ mode: 'new' | 'edit', config?: codex.Config } | null>(null)
  const [dockerConfigs, setDockerConfigs] = useState<docker.Config[]>([])
  const [dockerModal, setDockerModal] = useState<{ mode: 'new' | 'edit', config?: docker.Config } | null>(null)
  const [plugins, setPlugins] = useState<session.PluginInfo[]>([])
  const [selectedPluginId, setSelectedPluginId] = useState<string>('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const [installed, current] = await Promise.all([
        GetInstalledTerminals(),
        GetDefaultTerminal()
      ])
      setTerminals(installed || [])
      setDefaultTerminal(current === '' ? 'auto' : current)
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    }
  }

  const loadCodexConfigs = async () => {
    const method = getAppMethod('ListCodexConfigs')
    if (typeof method !== 'function') {
      return
    }
    try {
      const configs = await method()
      setCodexConfigs(configs || [])
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    }
  }

  const loadPlugins = async () => {
    const method = getAppMethod('ListLaunchPlugins')
    if (typeof method !== 'function') return
    try {
      const infos: session.PluginInfo[] = await method()
      setPlugins(infos || [])
      if (infos && infos.length > 0 && !selectedPluginId) {
        setSelectedPluginId(infos[0].id)
      }
    } catch { /* plugin list unavailable */ }
  }

  const loadDockerConfigs = async () => {
    const method = getAppMethod('ListDockerConfigs')
    if (typeof method !== 'function') return
    try {
      const configs = await method()
      setDockerConfigs(configs || [])
    } catch { /* docker unavailable */ }
  }

  useEffect(() => {
    loadCodexConfigs()
    loadDockerConfigs()
    loadPlugins()
  }, [])

  const handleSave = async (terminalID: string) => {
    setSaving(true)
    setMessage(null)
    try {
      const value = terminalID === 'auto' ? '' : terminalID
      await SetDefaultTerminal(value)
      setDefaultTerminal(terminalID)
      setMessage({ type: 'success', text: t('settings.terminal.updated') })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleExportBurrow = async () => {
    const method = getAppMethod('ExportBurrow')
    if (typeof method !== 'function') {
      setMessage({ type: 'error', text: t('settings.importExport.exportUnavailable') })
      return
    }

    setBurrowBusy('export')
    setMessage(null)
    try {
      const raw = await method()
      setBurrowBuffer(String(raw || ''))
      setShowExportModal(true)
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setBurrowBusy(null)
    }
  }

  const handleImportBurrow = async () => {
    const method = getAppMethod('ImportBurrow')
    if (typeof method !== 'function') {
      setMessage({ type: 'error', text: t('settings.importExport.importUnavailable') })
      return
    }

    setBurrowBusy('import')
    setMessage(null)
    try {
      await method(burrowBuffer)
      setShowImportModal(false)
      setBurrowBuffer('')
      onBurrowImported?.()
      setMessage({ type: 'success', text: t('settings.importExport.imported') })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setBurrowBusy(null)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-foreground mb-4">{t('settings.title')}</h1>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {SETTINGS_TAB_KEYS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded border text-sm ${
          message.type === 'success'
            ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
            : 'bg-destructive/10 border-destructive/50 text-destructive'
        }`}>
          {message.text}
        </div>
      )}

      {activeTab === 'general' && (
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t('settings.general.appearance')}</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">{t('settings.general.theme')}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t('settings.general.themeDesc')}</div>
            </div>
            <ThemeToggle />
          </div>
          <div className="mt-6 pt-6 border-t border-border flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">{t('settings.general.language')}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t('settings.general.languageDesc')}</div>
            </div>
            <Select value={language} onValueChange={v => setLanguage(v as Language)}>
              <SelectTrigger className="w-32 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {activeTab === 'terminal' && (
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t('settings.terminal.title')}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('settings.terminal.desc')}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-2">{t('settings.terminal.appLabel')}</label>
              {terminals.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {t('settings.terminal.noApps')}
                </div>
              ) : (
                <Select
                  value={defaultTerminal}
                  onValueChange={handleSave}
                  disabled={saving}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder={t('settings.terminal.selectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      <div className="flex items-center gap-2">
                        <TerminalIcon className="w-4 h-4 text-muted-foreground" />
                        <span>{t('settings.terminal.autoDetect')}</span>
                      </div>
                    </SelectItem>
                    {terminals.map(term => (
                      <SelectItem key={term.ID} value={term.ID}>
                        <div className="flex items-center gap-2">
                          <TerminalIcon className="w-4 h-4 text-muted-foreground" />
                          <span>{term.Name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {terminals.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border">
                <h3 className="text-sm font-medium text-foreground mb-3">{t('settings.terminal.installed')}</h3>
                <div className="space-y-2">
                  {terminals.map(term => (
                    <div
                      key={term.ID}
                      className="flex items-center justify-between p-3 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                          <TerminalIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{term.Name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{term.AppPath}</div>
                        </div>
                      </div>
                      {defaultTerminal === term.ID && (
                        <div className="flex items-center gap-1 text-xs text-primary">
                          <Check className="w-3 h-3" />
                          <span>{t('common.default')}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t('settings.importExport.title')}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('settings.importExport.desc')}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                {t('settings.importExport.warning')}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={handleExportBurrow}
              disabled={burrowBusy !== null}
            >
              <Download className="w-4 h-4" />
              {burrowBusy === 'export' ? t('settings.importExport.exporting') : t('settings.importExport.exportBurrow')}
            </Button>
            <Button
              onClick={() => {
                setBurrowBuffer('')
                setShowImportModal(true)
              }}
              disabled={burrowBusy !== null}
            >
              <Upload className="w-4 h-4" />
              {t('settings.importExport.importBurrow')}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'plugins' && (
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">{t('settings.plugins.title')}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t('settings.plugins.desc')}</p>

          <div className="flex gap-0 min-h-[320px]">
            {/* Left sidebar — plugin list */}
            <div className="w-48 shrink-0 border-r border-border pr-4 space-y-1">
              {plugins.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPluginId(p.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selectedPluginId === p.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                  }`}
                >
                  {t(p.label_key)}
                </button>
              ))}
            </div>

            {/* Right detail panel */}
            <div className="flex-1 pl-6">
              {(() => {
                const selected = plugins.find(p => p.id === selectedPluginId)
                if (!selected) return <div className="text-sm text-muted-foreground">{t('settings.plugins.desc')}</div>

                const isCodex = selected.id === 'codex'
                const isDocker = selected.id === 'docker'
                const isBuiltin = !isCodex && !isDocker

                const dockerCmdPreview = (cfg: docker.Config) => {
                  const parts = ['docker', 'run', '-it', '--rm', '-v', '${HOME}:/host/home', cfg.image]
                  return parts.join(' ')
                }

                return (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-base font-semibold text-foreground">{t(selected.label_key)}</h3>
                      {isBuiltin && (
                        <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t('settings.plugins.builtin')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-6">{t(selected.hint_key)}</p>

                    {isCodex && (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-foreground">{t('settings.codex.title')}</h4>
                          <Button size="sm" onClick={() => setCodexModal({ mode: 'new' })}>
                            <Plus className="w-4 h-4" />
                            {t('common.new')}
                          </Button>
                        </div>

                        {codexConfigs.length === 0 ? (
                          <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                            {t('settings.codex.empty')}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {codexConfigs.map(cfg => (
                              <div key={cfg.id} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/15 p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">{cfg.name}</span>
                                    <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                      {cfg.id}
                                    </span>
                                    <span className={`rounded px-1.5 py-0.5 text-[11px] ${cfg.auth_exists ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                      {cfg.auth_exists ? t('settings.codex.authExists') : t('settings.codex.authMissing')}
                                    </span>
                                  </div>
                                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{cfg.home_dir}</div>
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="secondary" size="sm" onClick={() => setCodexModal({ mode: 'edit', config: cfg })}>
                                    <Pencil className="w-3.5 h-3.5" />
                                    {t('common.edit')}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={async () => {
                                      if (!window.confirm(t('settings.codex.confirmRemove', { name: cfg.name }))) return
                                      const method = getAppMethod('DeleteCodexConfig')
                                      if (typeof method !== 'function') return
                                      try {
                                        await method(cfg.id)
                                        await loadCodexConfigs()
                                        setMessage({ type: 'success', text: t('settings.codex.removed') })
                                        setTimeout(() => setMessage(null), 3000)
                                      } catch (err) {
                                        setMessage({ type: 'error', text: String(err) })
                                      }
                                    }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('common.remove')}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {isDocker && (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-foreground">{t('settings.docker.title')}</h4>
                          <Button size="sm" onClick={() => setDockerModal({ mode: 'new' })}>
                            <Plus className="w-4 h-4" />
                            {t('common.new')}
                          </Button>
                        </div>

                        {dockerConfigs.length === 0 ? (
                          <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                            {t('settings.docker.empty')}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {dockerConfigs.map(cfg => (
                              <div key={cfg.id} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/15 p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">{cfg.name}</span>
                                    <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                      {cfg.id}
                                    </span>
                                  </div>
                                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{cfg.image}</div>
                                  <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/60">{dockerCmdPreview(cfg)}</div>
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="secondary" size="sm" onClick={() => setDockerModal({ mode: 'edit', config: cfg })}>
                                    <Pencil className="w-3.5 h-3.5" />
                                    {t('common.edit')}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={async () => {
                                      if (!window.confirm(t('settings.docker.confirmRemove', { name: cfg.name }))) return
                                      const method = getAppMethod('DeleteDockerConfig')
                                      if (typeof method !== 'function') return
                                      try {
                                        await method(cfg.id)
                                        await loadDockerConfigs()
                                        setMessage({ type: 'success', text: t('settings.docker.removed') })
                                        setTimeout(() => setMessage(null), 3000)
                                      } catch (err) {
                                        setMessage({ type: 'error', text: String(err) })
                                      }
                                    }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('common.remove')}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'about' && (
        <>
          <div className="flex flex-col items-center py-6">
            <pre className="font-mono text-sm leading-tight text-primary/80 select-none" aria-hidden="true">
{`┌┬┐┌─┐╷  ┌─╴
││││ ││  ├╴
╵ ╵└─┘└─╴└─╴`}
            </pre>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">{t('settings.about.supportedTerminals')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('settings.about.supportedDesc')}
            </p>
          </div>

          <div className="mt-6 bg-card rounded-lg border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">{t('settings.about.aboutMole')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('settings.about.aboutDesc')}
            </p>
          </div>
        </>
      )}

      {showExportModal && (
        <ModalShell
          title={t('settings.importExport.exportModalTitle')}
          description={t('settings.importExport.exportModalDesc')}
          onClose={() => setShowExportModal(false)}
          contentStyle={{ maxWidth: '760px' }}
          footer={(
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => ClipboardSetText(burrowBuffer)}
              >
                <Copy className="w-3.5 h-3.5" />
                {t('settings.importExport.copyJSON')}
              </Button>
              <Button onClick={() => setShowExportModal(false)}>{t('common.close')}</Button>
            </div>
          )}
        >
          <Textarea
            value={burrowBuffer}
            readOnly
            rows={14}
            className="font-mono text-xs bg-muted/30 focus:bg-background"
          />
        </ModalShell>
      )}

      {showImportModal && (
        <ModalShell
          title={t('settings.importExport.importModalTitle')}
          description={t('settings.importExport.importModalDesc')}
          onClose={() => setShowImportModal(false)}
          contentStyle={{ maxWidth: '760px' }}
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowImportModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleImportBurrow} disabled={burrowBusy === 'import'}>
                {burrowBusy === 'import' ? t('settings.importExport.importing') : t('settings.importExport.importBurrow')}
              </Button>
            </div>
          )}
        >
          <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
            {t('settings.importExport.importWarning')}
          </div>
          <Textarea
            value={burrowBuffer}
            onChange={e => setBurrowBuffer(e.target.value)}
            placeholder={t('settings.importExport.importPlaceholder')}
            rows={14}
            className="font-mono text-xs bg-muted/30 focus:bg-background"
          />
        </ModalShell>
      )}

      {codexModal && (
        <CodexConfigModal
          mode={codexModal.mode}
          config={codexModal.config}
          onClose={() => setCodexModal(null)}
          onSaved={async () => {
            setCodexModal(null)
            await loadCodexConfigs()
            setMessage({ type: 'success', text: t('settings.codex.saved') })
            setTimeout(() => setMessage(null), 3000)
          }}
        />
      )}

      {dockerModal && (
        <DockerConfigModal
          mode={dockerModal.mode}
          config={dockerModal.config}
          onClose={() => setDockerModal(null)}
          onSaved={async () => {
            setDockerModal(null)
            await loadDockerConfigs()
            setMessage({ type: 'success', text: t('settings.docker.saved') })
            setTimeout(() => setMessage(null), 3000)
          }}
        />
      )}
    </div>
  )
}

function CodexConfigModal({
  mode,
  config,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'edit'
  config?: codex.Config
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(config?.name || '')
  const [id, setId] = useState(config?.id || '')
  const [configToml, setConfigToml] = useState('')
  const [authJSON, setAuthJSON] = useState('')
  const [replaceAuth, setReplaceAuth] = useState(false)
  const [showAuthEditor, setShowAuthEditor] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const homePreview = id.trim()
    ? `~/.config/mole/ai/codex/${id.trim()}`
    : '~/.config/mole/ai/codex/<config-id>'

  useEffect(() => {
    if (!config?.id) return
    const method = getAppMethod('GetCodexConfigToml')
    if (typeof method !== 'function') return
    method(config.id)
      .then((raw: string) => setConfigToml(raw || ''))
      .catch((err: unknown) => setError(String(err)))
  }, [config?.id])

  const validateBeforeSave = () => {
    if (!name.trim()) return t('codex.modal.nameRequired')
    if (!/^[A-Za-z0-9_-]+$/.test(id.trim())) {
      return t('codex.modal.configIdHint')
    }
    try {
      validateTomlShape(configToml)
    } catch (err) {
      return String(err)
    }
    if (authJSON.trim()) {
      try {
        JSON.parse(authJSON)
      } catch (err) {
        return t('codex.modal.invalidAuth', { error: String(err) })
      }
    }
    return ''
  }

  const handleSave = async () => {
    const validationError = validateBeforeSave()
    if (validationError) {
      setError(validationError)
      return
    }
    const method = getAppMethod('SaveCodexConfig')
    if (typeof method !== 'function') {
      setError('SaveCodexConfig is unavailable')
      return
    }

    setSaving(true)
    setError('')
    try {
      await method({
        id: id.trim(),
        name: name.trim(),
        config_toml: configToml,
        auth_json: showAuthEditor ? authJSON : '',
        replace_auth: replaceAuth,
      })
      setAuthJSON('')
      onSaved()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const authExists = Boolean(config?.auth_exists)
  const authActionLabel = authExists ? t('codex.modal.replaceAuth') : t('codex.modal.initAuth')

  return (
    <ModalShell
      title={mode === 'new' ? t('codex.modal.newTitle') : t('codex.modal.editTitle', { name: config?.name || '' })}
      description={t('codex.modal.desc')}
      onClose={onClose}
      contentStyle={{ maxWidth: '760px' }}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !id.trim()}>
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

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('common.name')}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Maxx"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('codex.modal.configId')}</label>
            <input
              value={id}
              onChange={e => setId(e.target.value)}
              disabled={mode === 'edit'}
              placeholder="maxx"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm font-mono text-foreground disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">{t('codex.modal.codexHome')}</label>
          <div className="rounded border border-border bg-muted/20 px-3 py-2 font-mono text-xs text-muted-foreground">
            {config?.home_dir || homePreview}
          </div>
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">{t('codex.modal.configToml')}</label>
          <Textarea
            value={configToml}
            onChange={e => setConfigToml(e.target.value)}
            rows={12}
            placeholder={t('codex.modal.configTomlPlaceholder')}
            className="min-h-72 font-mono text-xs"
          />
        </div>

        <div className="rounded-lg border border-border bg-muted/15 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                {t('codex.modal.authJson')}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t('codex.modal.authStatus', { status: authExists ? t('codex.modal.authExists') : t('codex.modal.authMissing') })}
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowAuthEditor(!showAuthEditor)
                setReplaceAuth(authExists)
              }}
            >
              {authActionLabel}
            </Button>
          </div>

          {showAuthEditor && (
            <div className="mt-4 space-y-3">
              {authExists && (
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={replaceAuth}
                    onChange={e => setReplaceAuth(e.target.checked)}
                    className="mt-0.5"
                  />
                  {t('codex.modal.replaceAuthHint')}
                </label>
              )}
              <Textarea
                value={authJSON}
                onChange={e => setAuthJSON(e.target.value)}
                rows={5}
                placeholder={'{\n  "OPENAI_API_KEY": "maxx_your_token_here"\n}'}
                className="font-mono text-xs"
              />
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

function DockerConfigModal({
  mode,
  config,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'edit'
  config?: docker.Config
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(config?.name || '')
  const [id, setId] = useState(config?.id || '')
  const [image, setImage] = useState(config?.image || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dockerCmdPreview = image.trim()
    ? ['docker', 'run', '-it', '--rm', '-v', '${HOME}:/host/home', image.trim()].join(' ')
    : '-'

  const validateBeforeSave = () => {
    if (!name.trim()) return t('codex.modal.nameRequired')
    if (!/^[A-Za-z0-9_-]+$/.test(id.trim())) {
      return t('docker.modal.configIdHint')
    }
    if (!image.trim()) return 'Docker image is required'
    return ''
  }

  const handleSave = async () => {
    const validationError = validateBeforeSave()
    if (validationError) {
      setError(validationError)
      return
    }
    const method = getAppMethod('SaveDockerConfig')
    if (typeof method !== 'function') {
      setError('SaveDockerConfig is unavailable')
      return
    }

    setSaving(true)
    setError('')
    try {
      await method({
        id: id.trim(),
        name: name.trim(),
        image: image.trim(),
      })
      onSaved()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title={mode === 'new' ? t('docker.modal.newTitle') : t('docker.modal.editTitle', { name: config?.name || '' })}
      description={t('settings.docker.desc')}
      onClose={onClose}
      contentStyle={{ maxWidth: '640px' }}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !id.trim() || !image.trim()}>
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

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('docker.modal.name')}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('docker.modal.namePlaceholder')}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('docker.modal.configId')}</label>
            <input
              value={id}
              onChange={e => setId(e.target.value)}
              placeholder="ubuntu-dev"
              disabled={mode === 'edit'}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{t('docker.modal.configIdHint')}</p>
          </div>
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">{t('docker.modal.image')}</label>
          <input
            value={image}
            onChange={e => setImage(e.target.value)}
            placeholder={t('docker.modal.imagePlaceholder')}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          />
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">{t('docker.modal.commandPreview')}</div>
          <div className="font-mono text-xs text-foreground break-all">{dockerCmdPreview}</div>
        </div>
      </div>
    </ModalShell>
  )
}

function validateTomlShape(raw: string) {
  const lines = raw.split(/\r?\n/)
  let collectionDepth = 0
  for (let index = 0; index < lines.length; index++) {
    const line = stripTomlComment(lines[index]).trim()
    if (!line) continue
    if (collectionDepth > 0) {
      collectionDepth += tomlCollectionDelta(line)
      if (collectionDepth < 0) {
        throw new Error(`Unbalanced TOML collection at line ${index + 1}`)
      }
      continue
    }
    if (line.startsWith('[')) {
      if (!line.endsWith(']') || line.replace(/\[|\]/g, '').trim() === '') {
        throw new Error(`Invalid TOML table at line ${index + 1}`)
      }
      continue
    }
    if (!line.includes('=')) {
      throw new Error(`Invalid TOML assignment at line ${index + 1}`)
    }
    const [key, ...rest] = line.split('=')
    if (!key.trim() || !rest.join('=').trim()) {
      throw new Error(`Invalid TOML assignment at line ${index + 1}`)
    }
    collectionDepth += tomlCollectionDelta(rest.join('='))
    if (collectionDepth < 0) {
      throw new Error(`Unbalanced TOML collection at line ${index + 1}`)
    }
  }
  if (collectionDepth !== 0) {
    throw new Error('Unterminated TOML collection')
  }
}

function stripTomlComment(line: string) {
  let inDouble = false
  let inSingle = false
  let escaped = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (char === '\\' && inDouble) {
      escaped = !escaped
      continue
    }
    if (char === '"' && !inSingle && !escaped) inDouble = !inDouble
    if (char === "'" && !inDouble) inSingle = !inSingle
    if (char === '#' && !inDouble && !inSingle) return line.slice(0, index)
    escaped = false
  }
  return line
}

function tomlCollectionDelta(value: string) {
  let delta = 0
  let inDouble = false
  let inSingle = false
  let escaped = false
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === '\\' && inDouble) {
      escaped = !escaped
      continue
    }
    if (char === '"' && !inSingle && !escaped) inDouble = !inDouble
    if (char === "'" && !inDouble) inSingle = !inSingle
    if (!inDouble && !inSingle && (char === '[' || char === '{')) delta++
    if (!inDouble && !inSingle && (char === ']' || char === '}')) delta--
    escaped = false
  }
  return delta
}

export default Settings
