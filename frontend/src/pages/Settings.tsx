import { useState, useEffect } from 'react'
import { GetInstalledTerminals, GetDefaultTerminal, SetDefaultTerminal } from '../../wailsjs/go/main/App'
import { ClipboardSetText, Environment } from '../../wailsjs/runtime/runtime'
import { codex, docker, pluginconfig, session, terminal } from '../../wailsjs/go/models'
import { Button } from "@/components/ui/button"
import { ModalShell } from "@/components/ui/modal-shell"
import { useMoleSpeaker } from "@/lib/mole-messages"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ThemeToggle } from "@/components/theme-toggle"
import { useTranslation, type Language } from "@/i18n/context"
import { Check, Copy, Download, KeyRound, Pencil, Plus, Puzzle, Terminal as TerminalIcon, Trash2, TriangleAlert, Upload, Settings as SettingsIcon, Palette, HardDrive, FileUp, Info, ExternalLink, Loader2 } from "lucide-react"

type SettingsTab = 'general' | 'terminal' | 'import' | 'scripts' | 'plugins' | 'about'
type PluginConfigModalState = { mode: 'new' | 'edit'; pluginID: string; config?: pluginconfig.Config }
type ScriptConfigModalState = { mode: 'new' | 'edit'; config?: ScriptConfig }

type ScriptConfig = {
  id: string
  name: string
  description?: string
  platform?: string
  command: string
  builtin?: boolean
  created_at?: string
  updated_at?: string
}

type ScriptSaveRequest = {
  id: string
  name: string
  description?: string
  platform?: string
  command: string
}

type ScriptPlatform = 'macos' | 'windows'
type RuntimeScriptPlatform = ScriptPlatform | 'other'

type IntegrationStatus = {
  id: string
  name: string
  supported: boolean
  installed: boolean
  plugin_ready: boolean
  brew_available: boolean
  plugin_dir: string
  template: string
  interval: number
  available_templates: string[]
  available_intervals: number[]
}

const EXTERNAL_PLUGIN_IDS = ['k8s_pod', 'tmux_attach', 'remote_tmux']
const SETTINGS_PLUGIN_IDS = ['codex', 'docker', ...EXTERNAL_PLUGIN_IDS]

const PLUGIN_CONFIG_FIELDS: Record<string, { key: string; labelKey: string; placeholderKey: string; required?: boolean }[]> = {
  k8s_pod: [
    { key: 'kubeconfig_path', labelKey: 'pluginConfig.k8s.kubeconfig', placeholderKey: 'pluginConfig.k8s.kubeconfigPlaceholder' },
    { key: 'namespace', labelKey: 'pluginConfig.k8s.namespace', placeholderKey: 'pluginConfig.k8s.namespacePlaceholder', required: true },
    { key: 'shell', labelKey: 'pluginConfig.k8s.shell', placeholderKey: 'pluginConfig.k8s.shellPlaceholder', required: true },
  ],
  tmux_attach: [
    { key: 'session_name', labelKey: 'pluginConfig.tmux.sessionName', placeholderKey: 'pluginConfig.tmux.sessionNamePlaceholder', required: true },
  ],
  remote_tmux: [
    { key: 'ssh_target', labelKey: 'pluginConfig.remoteTmux.sshTarget', placeholderKey: 'pluginConfig.remoteTmux.sshTargetPlaceholder', required: true },
    { key: 'session_name', labelKey: 'pluginConfig.tmux.sessionName', placeholderKey: 'pluginConfig.tmux.sessionNamePlaceholder', required: true },
  ],
}

const pluginConfigDefaults = (pluginID: string): Record<string, string> => {
  if (pluginID === 'k8s_pod') return { namespace: 'default', shell: '/bin/sh' }
  return {}
}

const SETTINGS_TAB_KEYS: { key: SettingsTab; labelKey: string; icon: typeof SettingsIcon }[] = [
  { key: 'general', labelKey: 'settings.tab.general', icon: Palette },
  { key: 'terminal', labelKey: 'settings.tab.terminal', icon: TerminalIcon },
  { key: 'import', labelKey: 'settings.tab.import', icon: FileUp },
  { key: 'scripts', labelKey: 'settings.tab.scripts', icon: HardDrive },
  { key: 'plugins', labelKey: 'settings.tab.plugins', icon: Puzzle },
  { key: 'about', labelKey: 'settings.tab.about', icon: Info },
]

const SCRIPT_PLATFORM_OPTIONS: { value: ScriptPlatform; labelKey: string }[] = [
  { value: 'macos', labelKey: 'settings.scripts.platformMacOS' },
  { value: 'windows', labelKey: 'settings.scripts.platformWindows' },
]

const BUILTIN_SCRIPT_CONTENT: Record<string, string> = {
  'vscode-claude-mac': `#!/usr/bin/env bash
set -euo pipefail
WORKSPACE="\${MOLE_WORKSPACE:-$HOME}"

cd "$WORKSPACE"
mkdir -p .vscode

# Write profile env vars to .vscode/settings.json for Claude Code extension
python3 -c '
import json, os, sys
path = os.path.join(".vscode", "settings.json")
settings = {}
if os.path.isfile(path):
    try:
        with open(path) as f:
            settings = json.load(f)
    except Exception:
        pass
env = settings.get("claude-code.environmentVariables", {})
for key in ("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"):
    val = os.environ.get(key)
    if val:
        env[key] = val
    else:
        env.pop(key, None)
if env:
    settings["claude-code.environmentVariables"] = env
else:
    settings.pop("claude-code.environmentVariables", None)
with open(path, "w") as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
    f.write("\\n")
'

code -n "$WORKSPACE"`,
  'vscode-claude-win': `$Workspace = if ($env:MOLE_WORKSPACE) { $env:MOLE_WORKSPACE } else { $env:USERPROFILE }

Set-Location $Workspace
if (!(Test-Path ".vscode")) { New-Item -ItemType Directory -Path ".vscode" | Out-Null }

# Write profile env vars to .vscode/settings.json for Claude Code extension
$settingsPath = Join-Path ".vscode" "settings.json"
$settings = @{}
if (Test-Path $settingsPath) {
    try { $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json -AsHashtable } catch {}
}
$envMap = @{}
if ($settings."claude-code.environmentVariables") {
    $settings."claude-code.environmentVariables".GetEnumerator() | ForEach-Object { $envMap[$_.Key] = $_.Value }
}
foreach ($key in @("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL")) {
    $val = [Environment]::GetEnvironmentVariable($key)
    if ($val) { $envMap[$key] = $val } else { $envMap.Remove($key) }
}
if ($envMap.Count -gt 0) { $settings."claude-code.environmentVariables" = $envMap } else { $settings.Remove("claude-code.environmentVariables") }
$settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8

code -n $Workspace`,
  'vscode-claude-wsl': `#!/usr/bin/env bash
set -euo pipefail
WORKSPACE="\${MOLE_WORKSPACE:-$HOME}"

cd "$WORKSPACE"
mkdir -p .claude

code .`,
}

const normalizeScriptPlatform = (value?: string): ScriptPlatform | '' => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'macos' || normalized === 'windows') return normalized
  return ''
}

const resolveRuntimeScriptPlatform = (platform?: string): RuntimeScriptPlatform => {
  if (platform === 'darwin') return 'macos'
  if (platform === 'windows') return 'windows'
  return 'other'
}

const scriptPlatformMatchesRuntime = (cfg: ScriptConfig, runtimePlatform: RuntimeScriptPlatform) => {
  const platform = normalizeScriptPlatform(cfg.platform)
  if (!platform) return true
  if (runtimePlatform === 'other') return true
  return platform === runtimePlatform
}

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
  const speakBubble = useMoleSpeaker()
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [burrowBuffer, setBurrowBuffer] = useState('')
  const [burrowBusy, setBurrowBusy] = useState<'export' | 'import' | null>(null)
  const [codexConfigs, setCodexConfigs] = useState<codex.Config[]>([])
  const [codexModal, setCodexModal] = useState<{ mode: 'new' | 'edit', config?: codex.Config } | null>(null)
  const [dockerConfigs, setDockerConfigs] = useState<docker.Config[]>([])
  const [dockerModal, setDockerModal] = useState<{ mode: 'new' | 'edit', config?: docker.Config } | null>(null)
  const [scriptConfigs, setScriptConfigs] = useState<ScriptConfig[]>([])
  const [selectedScriptId, setSelectedScriptId] = useState('')
  const [runtimeScriptPlatform, setRuntimeScriptPlatform] = useState<RuntimeScriptPlatform>('other')
  const [scriptModal, setScriptModal] = useState<ScriptConfigModalState | null>(null)
  const [plugins, setPlugins] = useState<session.PluginInfo[]>([])
  const [selectedPluginId, setSelectedPluginId] = useState<string>('')
  const [pluginConfigs, setPluginConfigs] = useState<pluginconfig.Config[]>([])
  const [pluginConfigModal, setPluginConfigModal] = useState<PluginConfigModalState | null>(null)
  const [integrationStatuses, setIntegrationStatuses] = useState<IntegrationStatus[]>([])
  const [integrationBusy, setIntegrationBusy] = useState<string | null>(null)
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>('')

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    let cancelled = false
    void Environment()
      .then(info => {
        if (cancelled) return
        setRuntimeScriptPlatform(resolveRuntimeScriptPlatform(info?.platform))
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeScriptPlatform('other')
        }
      })
    return () => {
      cancelled = true
    }
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
      speakBubble({ type: 'error', text: String(err) })
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
      speakBubble({ type: 'error', text: String(err) })
    }
  }

  const loadPlugins = async () => {
    const method = getAppMethod('ListLaunchPlugins')
    if (typeof method !== 'function') return
    try {
      const infos: session.PluginInfo[] = await method()
      const visible = (infos || []).filter(p => SETTINGS_PLUGIN_IDS.includes(p.id))
      setPlugins(visible)
      if (visible.length > 0 && !selectedPluginId) {
        setSelectedPluginId(visible[0].id)
      }
    } catch { /* plugin list unavailable */ }
  }

  useEffect(() => {
    if (!selectedPluginId) return
    if (!plugins.some(p => p.id === selectedPluginId)) {
      setSelectedPluginId(plugins[0]?.id || '')
    }
  }, [plugins, selectedPluginId])

  useEffect(() => {
    if (scriptConfigs.length === 0) {
      setSelectedScriptId('')
      return
    }
    if (!scriptConfigs.some(cfg => cfg.id === selectedScriptId)) {
      setSelectedScriptId(scriptConfigs[0].id)
    }
  }, [scriptConfigs, selectedScriptId])

  const loadDockerConfigs = async () => {
    const method = getAppMethod('ListDockerConfigs')
    if (typeof method !== 'function') return
    try {
      const configs = await method()
      setDockerConfigs(configs || [])
    } catch { /* docker unavailable */ }
  }

  const loadPluginConfigs = async () => {
    const method = getAppMethod('ListPluginConfigs')
    if (typeof method !== 'function') return
    try {
      const configs: pluginconfig.Config[] = await method('')
      setPluginConfigs(configs || [])
    } catch { /* plugin configs unavailable */ }
  }

  const loadScriptConfigs = async () => {
    const method = getAppMethod('ListScriptConfigs')
    if (typeof method !== 'function') return
    try {
      const configs: ScriptConfig[] = await method()
      setScriptConfigs(configs || [])
    } catch (err) {
      speakBubble({ type: 'error', text: String(err) })
    }
  }

  useEffect(() => {
    loadCodexConfigs()
    loadDockerConfigs()
    loadScriptConfigs()
    loadPluginConfigs()
    loadPlugins()
    loadIntegrationStatuses()
  }, [])

  const loadIntegrationStatuses = async () => {
    const method = getAppMethod('ListIntegrationStatuses')
    if (typeof method !== 'function') return
    try {
      const statuses: IntegrationStatus[] = await method()
      setIntegrationStatuses(statuses || [])
      if (statuses && statuses.length > 0 && !selectedIntegrationId) {
        const supported = statuses.filter(s => s.supported)
        if (supported.length > 0) setSelectedIntegrationId(supported[0].id)
      }
    } catch { /* integration unavailable */ }
  }

  const handleSave = async (terminalID: string) => {
    setSaving(true)
    try {
      const value = terminalID === 'auto' ? '' : terminalID
      await SetDefaultTerminal(value)
      setDefaultTerminal(terminalID)
      speakBubble({ type: 'success', text: t('settings.terminal.updated') })
    } catch (err) {
      speakBubble({ type: 'error', text: String(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleExportBurrow = async () => {
    const method = getAppMethod('ExportBurrow')
    if (typeof method !== 'function') {
      speakBubble({ type: 'error', text: t('settings.importExport.exportUnavailable') })
      return
    }

    setBurrowBusy('export')
    try {
      const raw = await method()
      setBurrowBuffer(String(raw || ''))
      setShowExportModal(true)
    } catch (err) {
      speakBubble({ type: 'error', text: String(err) })
    } finally {
      setBurrowBusy(null)
    }
  }

  const handleImportBurrow = async () => {
    const method = getAppMethod('ImportBurrow')
    if (typeof method !== 'function') {
      speakBubble({ type: 'error', text: t('settings.importExport.importUnavailable') })
      return
    }

    setBurrowBusy('import')
    try {
      await method(burrowBuffer)
      setShowImportModal(false)
      setBurrowBuffer('')
      onBurrowImported?.()
      speakBubble({ type: 'success', text: t('settings.importExport.imported') })
    } catch (err) {
      speakBubble({ type: 'error', text: String(err) })
    } finally {
      setBurrowBusy(null)
    }
  }

  const sortedScriptConfigs = [...scriptConfigs].sort((a, b) =>
    (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base', numeric: true })
  )
  const selectedScriptConfig = sortedScriptConfigs.find(cfg => cfg.id === selectedScriptId) || sortedScriptConfigs[0]
  const runtimeFilteredScriptCount = sortedScriptConfigs.filter(cfg => scriptPlatformMatchesRuntime(cfg, runtimeScriptPlatform)).length
  const runtimePlatformLabel = runtimeScriptPlatform === 'macos'
    ? t('settings.scripts.platformMacOS')
    : runtimeScriptPlatform === 'windows'
      ? t('settings.scripts.platformWindows')
      : t('common.none')

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="surface-panel rounded-2xl border border-border px-5 py-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">{t('settings.title')}</h1>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {SETTINGS_TAB_KEYS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`interactive-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-primary bg-[hsl(var(--selected))] text-[hsl(var(--selected-foreground))]'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(tab.labelKey)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="app-scroll min-h-0 flex-1 overflow-auto pr-1">
      {activeTab === 'general' && (
        <div className="surface-panel rounded-2xl border border-border p-6">
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
        <div className="surface-panel rounded-2xl border border-border p-6">
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
                      className="breathing-card flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 p-3 transition-all"
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
        <div className="surface-panel rounded-2xl border border-border p-6">
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

      {activeTab === 'scripts' && (
        <div className="surface-panel rounded-2xl border border-border p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t('settings.scripts.title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('settings.scripts.desc')}</p>
            </div>
            <Button
              size="sm"
              onClick={() => setScriptModal({
                mode: 'new',
                config: {
                  id: '',
                  name: '',
                  description: '',
                  platform: runtimeScriptPlatform === 'windows' ? 'windows' : 'macos',
                  command: '',
                },
              })}
            >
              <Plus className="w-4 h-4" />
              {t('common.new')}
            </Button>
          </div>

          {scriptConfigs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6">
              <div className="text-sm text-muted-foreground">{t('settings.scripts.empty')}</div>
            </div>
          ) : (
            <div className="flex min-h-[320px] gap-0">
              <div className="w-56 shrink-0 border-r border-border pr-4 space-y-1">
                {sortedScriptConfigs.map(cfg => {
                  const selected = selectedScriptConfig?.id === cfg.id
                  const platform = normalizeScriptPlatform(cfg.platform)
                  return (
                    <button
                      key={cfg.id}
                      type="button"
                      onClick={() => setSelectedScriptId(cfg.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? 'border-primary/30 bg-[hsl(var(--selected))] text-[hsl(var(--selected-foreground))]'
                          : 'border-transparent text-muted-foreground hover:border-primary/20 hover:bg-muted/30 hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{cfg.name || cfg.id}</span>
                        {cfg.builtin && (
                          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{t('settings.plugins.builtin')}</span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] opacity-80">
                        {platform
                          ? t(platform === 'macos' ? 'settings.scripts.platformMacOS' : 'settings.scripts.platformWindows')
                          : t('settings.scripts.platformAny')}
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="flex-1 pl-6">
                {!selectedScriptConfig ? (
                  <div className="text-sm text-muted-foreground">{t('settings.scripts.empty')}</div>
                ) : (
                  <div>
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">{selectedScriptConfig.name || selectedScriptConfig.id}</h3>
                          <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {selectedScriptConfig.id}
                          </span>
                          <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {(() => {
                              const platform = normalizeScriptPlatform(selectedScriptConfig.platform)
                              if (!platform) return t('settings.scripts.platformAny')
                              return t(platform === 'macos' ? 'settings.scripts.platformMacOS' : 'settings.scripts.platformWindows')
                            })()}
                          </span>
                        </div>
                        {selectedScriptConfig.description ? (
                          <p className="mt-2 text-sm text-muted-foreground">{selectedScriptConfig.description}</p>
                        ) : (
                          <p className="mt-2 text-sm text-muted-foreground">{t('settings.scripts.noDescription')}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {!selectedScriptConfig.builtin && (
                          <>
                            <Button variant="secondary" size="sm" onClick={() => setScriptModal({ mode: 'edit', config: selectedScriptConfig })}>
                              <Pencil className="w-3.5 h-3.5" />
                              {t('common.edit')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={async () => {
                                if (!window.confirm(t('settings.scripts.confirmRemove', { name: selectedScriptConfig.name }))) return
                                const method = getAppMethod('DeleteScriptConfig')
                                if (typeof method !== 'function') return
                                try {
                                  await method(selectedScriptConfig.id)
                                  await loadScriptConfigs()
                                  speakBubble({ type: 'success', text: t('settings.scripts.removed') })
                                } catch (err) {
                                  speakBubble({ type: 'error', text: String(err) })
                                }
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {t('common.remove')}
                            </Button>
                          </>
                        )}
                        {selectedScriptConfig.builtin && (
                          <span className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{t('settings.plugins.builtin')}</span>
                        )}
                      </div>
                    </div>
                    {!selectedScriptConfig.builtin && (
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <div className="mb-1 text-xs font-medium text-muted-foreground">{t('settings.scripts.command')}</div>
                        <div className="font-mono text-xs text-foreground break-all">{selectedScriptConfig.command}</div>
                      </div>
                    )}

                    {BUILTIN_SCRIPT_CONTENT[selectedScriptConfig.id] && (
                      <div className="mt-3 rounded-lg border border-border bg-background p-3">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">{t('settings.scripts.builtinContent')}</div>
                        <pre className="overflow-auto rounded border border-border/70 bg-muted/20 p-3 font-mono text-[11px] text-foreground whitespace-pre-wrap break-words">
                          {BUILTIN_SCRIPT_CONTENT[selectedScriptConfig.id]}
                        </pre>
                      </div>
                    )}
                    <div className="mt-3 rounded-lg border border-border bg-background/70 p-3 text-xs text-muted-foreground">
                      {t('settings.scripts.runtimeHint', {
                        platform: runtimePlatformLabel,
                        count: runtimeFilteredScriptCount,
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'plugins' && (
        <div className="surface-panel rounded-2xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">{t('settings.plugins.title')}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t('settings.plugins.desc')}</p>

          <div className="flex min-h-[320px] gap-0">
            {/* Left sidebar — plugin list */}
            <div className="w-48 shrink-0 border-r border-border pr-4 space-y-1">
              {plugins.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPluginId(p.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    selectedPluginId === p.id
                      ? 'border-primary/30 bg-[hsl(var(--selected))] font-medium text-[hsl(var(--selected-foreground))]'
                      : 'border-transparent text-muted-foreground hover:border-primary/20 hover:bg-muted/30 hover:text-foreground'
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
                const isExternal = EXTERNAL_PLUGIN_IDS.includes(selected.id)
                const isBuiltin = !isCodex && !isDocker && !isExternal
                const selectedPluginConfigs = pluginConfigs.filter(cfg => cfg.plugin_id === selected.id)

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
                              <div key={cfg.id} className="breathing-card flex flex-col gap-3 rounded-2xl border border-border bg-muted/15 p-3 sm:flex-row sm:items-center sm:justify-between">
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
                                        speakBubble({ type: 'success', text: t('settings.codex.removed') })
                                      } catch (err) {
                                        speakBubble({ type: 'error', text: String(err) })
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
                              <div key={cfg.id} className="breathing-card flex flex-col gap-3 rounded-2xl border border-border bg-muted/15 p-3 sm:flex-row sm:items-center sm:justify-between">
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
                                        speakBubble({ type: 'success', text: t('settings.docker.removed') })
                                      } catch (err) {
                                        speakBubble({ type: 'error', text: String(err) })
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

                    {isExternal && (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-foreground">{t('settings.pluginConfigs.title')}</h4>
                          <Button size="sm" onClick={() => setPluginConfigModal({ mode: 'new', pluginID: selected.id })}>
                            <Plus className="w-4 h-4" />
                            {t('common.new')}
                          </Button>
                        </div>

                        {selectedPluginConfigs.length === 0 ? (
                          <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                            {t('settings.pluginConfigs.empty')}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {selectedPluginConfigs.map(cfg => (
                              <div key={cfg.id} className="breathing-card flex flex-col gap-3 rounded-2xl border border-border bg-muted/15 p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">{cfg.name}</span>
                                    <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                      {cfg.id}
                                    </span>
                                  </div>
                                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    {pluginConfigSummary(selected.id, cfg)}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="secondary" size="sm" onClick={() => setPluginConfigModal({ mode: 'edit', pluginID: selected.id, config: cfg })}>
                                    <Pencil className="w-3.5 h-3.5" />
                                    {t('common.edit')}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={async () => {
                                      if (!window.confirm(t('settings.pluginConfigs.confirmRemove', { name: cfg.name }))) return
                                      const method = getAppMethod('DeletePluginConfig')
                                      if (typeof method !== 'function') return
                                      try {
                                        await method(cfg.id)
                                        await loadPluginConfigs()
                                        speakBubble({ type: 'success', text: t('settings.pluginConfigs.removed') })
                                      } catch (err) {
                                        speakBubble({ type: 'error', text: String(err) })
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

          {/* Integrations section inside plugins tab — same sidebar+detail layout */}
          {integrationStatuses.some(s => s.supported) && (
          <div className="border-t border-border mt-8 pt-8">
            <h2 className="text-lg font-semibold text-foreground mb-1">{t('settings.integrations.title')}</h2>
            <p className="text-sm text-muted-foreground mb-6">{t('settings.integrations.desc')}</p>

            {!integrationStatuses.some(s => s.brew_available) && (
              <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div>{t('settings.integrations.noBrew')}</div>
                </div>
              </div>
            )}

            <div className="flex gap-0">
              {/* Left sidebar — integration list */}
              <div className="w-48 shrink-0 border-r border-border pr-4 space-y-1">
                {integrationStatuses.filter(s => s.supported).map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedIntegrationId(s.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                      selectedIntegrationId === s.id
                        ? 'border-primary/30 bg-[hsl(var(--selected))] font-medium text-[hsl(var(--selected-foreground))]'
                        : 'border-transparent text-muted-foreground hover:border-primary/20 hover:bg-muted/30 hover:text-foreground'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {/* Right detail panel — 2-step setup + config */}
              <div className="flex-1 min-w-0 pl-6 overflow-hidden">
                {(() => {
                  const selected = integrationStatuses.find(s => s.id === selectedIntegrationId && s.supported)
                  if (!selected) return <div className="text-sm text-muted-foreground">{t('settings.integrations.desc')}</div>

                  const installed = selected.installed
                  const pluginReady = selected.plugin_ready
                  const busy = integrationBusy === selected.id
                  const currentTemplate = selected.template || 'compact'
                  const currentInterval = selected.interval || 30

                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-foreground">{selected.name}</h3>
                        {pluginReady && (
                          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            {t('settings.integrations.ready')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">{t('settings.integrations.desc')}</p>

                      {/* 2-step progress */}
                      <div className="space-y-2">
                        {/* Step 1 — Install (auto-deploys plugin) */}
                        <div className={`rounded-xl border p-3 transition-colors ${installed ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/15'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${installed ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground'}`}>
                                {installed ? <Check className="w-3.5 h-3.5" /> : '1'}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground">{t('settings.integrations.stepInstall')}</div>
                                {installed && !pluginReady && (
                                  <div className="text-xs text-muted-foreground">{t('settings.integrations.installed')}</div>
                                )}
                                {installed && pluginReady && (
                                  <div className="text-xs text-primary">{t('settings.integrations.autoDeployed')}</div>
                                )}
                              </div>
                            </div>
                            {!installed && (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={async () => {
                                  setIntegrationBusy(selected.id)
                                  try {
                                    const method = getAppMethod('InstallIntegration')
                                    if (typeof method !== 'function') return
                                    await method(selected.id)
                                    await loadIntegrationStatuses()
                                    speakBubble({ type: 'success', text: t('settings.integrations.installSuccess', { name: selected.name }) })
                                  } catch (err) {
                                    speakBubble({ type: 'error', text: String(err) })
                                  } finally {
                                    setIntegrationBusy(null)
                                  }
                                }}
                              >
                                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                {busy ? t('settings.integrations.installing') : t('settings.integrations.install')}
                              </Button>
                            )}
                            {installed && !pluginReady && (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={async () => {
                                  setIntegrationBusy(selected.id)
                                  try {
                                    const method = getAppMethod('DeployIntegrationPluginWithOptions')
                                    if (typeof method !== 'function') return
                                    await method(selected.id, 'compact', '30')
                                    await loadIntegrationStatuses()
                                    speakBubble({ type: 'success', text: t('settings.integrations.deploySuccess', { name: selected.name }) })
                                  } catch (err) {
                                    speakBubble({ type: 'error', text: String(err) })
                                  } finally {
                                    setIntegrationBusy(null)
                                  }
                                }}
                              >
                                {t('settings.integrations.redeploy')}
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Step 2 — Open */}
                        <div className={`rounded-xl border p-3 transition-colors ${pluginReady ? 'border-primary/30 bg-primary/5' : installed ? 'border-border bg-muted/15' : 'border-border/50 bg-muted/5'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${pluginReady ? 'border-primary/30 bg-primary/10 text-primary' : installed ? 'border-border bg-muted text-muted-foreground' : 'border-border/50 bg-muted/20 text-muted-foreground/50'}`}>
                                {pluginReady ? <Check className="w-3.5 h-3.5" /> : '2'}
                              </div>
                              <div className="min-w-0">
                                <div className={`text-sm font-medium ${installed ? 'text-foreground' : 'text-muted-foreground'}`}>{t('settings.integrations.stepOpen')}</div>
                                {pluginReady && (
                                  <div className="text-xs text-primary">{t('settings.integrations.ready')}</div>
                                )}
                              </div>
                            </div>
                            {pluginReady && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    const method = getAppMethod('OpenIntegration')
                                    if (typeof method !== 'function') return
                                    await method(selected.id)
                                  } catch (err) {
                                    speakBubble({ type: 'error', text: String(err) })
                                  }
                                }}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                {t('settings.integrations.open')}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Plugin config panel — visible when deployed */}
                      {pluginReady && (
                        <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[10px] font-semibold text-primary">
                                <SettingsIcon className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground">{t('settings.integrations.deployedInfo', { template: currentTemplate, interval: currentInterval })}</div>
                              </div>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-7 text-xs shrink-0"
                              disabled={busy}
                              onClick={async () => {
                                setIntegrationBusy(selected.id)
                                try {
                                  const method = getAppMethod('DeployIntegrationPluginWithOptions')
                                  if (typeof method !== 'function') return
                                  await method(selected.id, currentTemplate, String(currentInterval))
                                  await loadIntegrationStatuses()
                                  speakBubble({ type: 'success', text: t('settings.integrations.deploySuccess', { name: selected.name }) })
                                } catch (err) {
                                  speakBubble({ type: 'error', text: String(err) })
                                } finally {
                                  setIntegrationBusy(null)
                                }
                              }}
                            >
                              {t('settings.integrations.redeploy')}
                            </Button>
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">{t('settings.integrations.template')}</label>
                              <Select
                                value={currentTemplate}
                                disabled={busy}
                                onValueChange={async (newTemplate) => {
                                  setIntegrationBusy(selected.id)
                                  try {
                                    const method = getAppMethod('DeployIntegrationPluginWithOptions')
                                    if (typeof method !== 'function') return
                                    await method(selected.id, newTemplate, String(currentInterval))
                                    await loadIntegrationStatuses()
                                    speakBubble({ type: 'success', text: t('settings.integrations.deploySuccess', { name: selected.name }) })
                                  } catch (err) {
                                    speakBubble({ type: 'error', text: String(err) })
                                  } finally {
                                    setIntegrationBusy(null)
                                  }
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {selected.available_templates.map(tmpl => (
                                    <SelectItem key={tmpl} value={tmpl} className="text-xs">
                                      {t(`settings.integrations.template${tmpl.charAt(0).toUpperCase() + tmpl.slice(1)}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex-1 min-w-0">
                              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">{t('settings.integrations.refreshInterval')}</label>
                              <Select
                                value={String(currentInterval)}
                                disabled={busy}
                                onValueChange={async (newInterval) => {
                                  setIntegrationBusy(selected.id)
                                  try {
                                    const method = getAppMethod('DeployIntegrationPluginWithOptions')
                                    if (typeof method !== 'function') return
                                    await method(selected.id, currentTemplate, newInterval)
                                    await loadIntegrationStatuses()
                                    speakBubble({ type: 'success', text: t('settings.integrations.deploySuccess', { name: selected.name }) })
                                  } catch (err) {
                                    speakBubble({ type: 'error', text: String(err) })
                                  } finally {
                                    setIntegrationBusy(null)
                                  }
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {selected.available_intervals.map(iv => (
                                    <SelectItem key={iv} value={String(iv)} className="text-xs">
                                      {iv}s
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
          )}
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

          <div className="surface-panel rounded-2xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">{t('settings.about.supportedTerminals')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('settings.about.supportedDesc')}
            </p>
          </div>

          <div className="mt-6 surface-panel rounded-2xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">{t('settings.about.aboutMole')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('settings.about.aboutDesc')}
            </p>
          </div>
        </>
      )}
      </div>

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
            speakBubble({ type: 'success', text: t('settings.codex.saved') })
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
            speakBubble({ type: 'success', text: t('settings.docker.saved') })
          }}
        />
      )}

      {scriptModal && (
        <ScriptConfigModal
          mode={scriptModal.mode}
          config={scriptModal.config}
          onClose={() => setScriptModal(null)}
          onSaved={async () => {
            setScriptModal(null)
            await loadScriptConfigs()
            speakBubble({ type: 'success', text: t('settings.scripts.saved') })
          }}
        />
      )}

      {pluginConfigModal && (
        <LaunchPluginConfigModal
          mode={pluginConfigModal.mode}
          pluginID={pluginConfigModal.pluginID}
          plugin={plugins.find(p => p.id === pluginConfigModal.pluginID)}
          config={pluginConfigModal.config}
          onClose={() => setPluginConfigModal(null)}
          onSaved={async () => {
            setPluginConfigModal(null)
            await loadPluginConfigs()
            speakBubble({ type: 'success', text: t('settings.pluginConfigs.saved') })
          }}
        />
      )}
    </div>
  )
}

function pluginConfigSummary(pluginID: string, cfg: pluginconfig.Config) {
  const settings = cfg.settings || {}
  if (pluginID === 'k8s_pod') {
    const kubeconfig = settings.kubeconfig_path || '~/.kube/config'
    return `${kubeconfig} · ${settings.namespace || 'default'} · ${settings.shell || '/bin/sh'}`
  }
  if (pluginID === 'tmux_attach') return settings.session_name || '-'
  if (pluginID === 'remote_tmux') return `${settings.ssh_target || '-'} · ${settings.session_name || '-'}`
  return Object.values(settings).filter(Boolean).join(' · ') || '-'
}

function LaunchPluginConfigModal({
  mode,
  pluginID,
  plugin,
  config,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'edit'
  pluginID: string
  plugin?: session.PluginInfo
  config?: pluginconfig.Config
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const fields = PLUGIN_CONFIG_FIELDS[pluginID] || []
  const [name, setName] = useState(config?.name || '')
  const [id, setId] = useState(config?.id || '')
  const [settings, setSettings] = useState<Record<string, string>>({
    ...pluginConfigDefaults(pluginID),
    ...(config?.settings || {}),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const validateBeforeSave = () => {
    if (!name.trim()) return t('codex.modal.nameRequired')
    if (!/^[A-Za-z0-9_-]+$/.test(id.trim())) return t('docker.modal.configIdHint')
    const missing = fields.find(field => field.required && !String(settings[field.key] || '').trim())
    if (missing) return t('settings.pluginConfigs.fieldRequired', { name: t(missing.labelKey) })
    return ''
  }

  const preview = pluginConfigSummary(pluginID, {
    id,
    name,
    plugin_id: pluginID,
    settings,
    created_at: '',
    updated_at: '',
  })

  const handleSave = async () => {
    const validationError = validateBeforeSave()
    if (validationError) {
      setError(validationError)
      return
    }
    const method = getAppMethod('SavePluginConfig')
    if (typeof method !== 'function') {
      setError('SavePluginConfig is unavailable')
      return
    }

    setSaving(true)
    setError('')
    try {
      await method({
        id: id.trim(),
        name: name.trim(),
        plugin_id: pluginID,
        settings,
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
      title={mode === 'new' ? t('settings.pluginConfigs.newTitle', { plugin: plugin ? t(plugin.label_key) : pluginID }) : t('settings.pluginConfigs.editTitle', { name: config?.name || '' })}
      description={t('settings.pluginConfigs.desc')}
      onClose={onClose}
      contentStyle={{ maxWidth: '640px' }}
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
            <label className="block text-sm text-muted-foreground mb-1">{t('docker.modal.name')}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('settings.pluginConfigs.namePlaceholder')}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">{t('docker.modal.configId')}</label>
            <input
              value={id}
              onChange={e => setId(e.target.value)}
              placeholder="dev"
              disabled={mode === 'edit'}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{t('docker.modal.configIdHint')}</p>
          </div>
        </div>

        {fields.map(field => (
          <div key={field.key}>
            <label className="block text-sm text-muted-foreground mb-1">{t(field.labelKey)}</label>
            <input
              value={settings[field.key] || ''}
              onChange={e => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={t(field.placeholderKey)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
          </div>
        ))}

        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">{t('common.preview')}</div>
          <div className="font-mono text-xs text-foreground break-all">{preview}</div>
        </div>
      </div>
    </ModalShell>
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

function ScriptConfigModal({
  mode,
  config,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'edit'
  config?: ScriptConfig
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(config?.name || '')
  const [id, setId] = useState(config?.id || '')
  const [description, setDescription] = useState(config?.description || '')
  const [platform, setPlatform] = useState<ScriptPlatform>(normalizeScriptPlatform(config?.platform) || 'macos')
  const [command, setCommand] = useState(config?.command || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const validateBeforeSave = () => {
    if (!name.trim()) return t('codex.modal.nameRequired')
    if (!/^[A-Za-z0-9_-]+$/.test(id.trim())) return t('docker.modal.configIdHint')
    if (!command.trim()) return t('settings.scripts.commandRequired')
    return ''
  }

  const handleSave = async () => {
    const validationError = validateBeforeSave()
    if (validationError) {
      setError(validationError)
      return
    }
    const method = getAppMethod('SaveScriptConfig')
    if (typeof method !== 'function') {
      setError('SaveScriptConfig is unavailable')
      return
    }

    setSaving(true)
    setError('')
    try {
      const req: ScriptSaveRequest = {
        id: id.trim(),
        name: name.trim(),
        description: description.trim(),
        platform: platform,
        command: command.trim(),
      }
      await method(req)
      onSaved()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title={mode === 'new' ? t('settings.scripts.newTitle') : t('settings.scripts.editTitle', { name: config?.name || '' })}
      description={t('settings.scripts.desc')}
      onClose={onClose}
      contentStyle={{ maxWidth: '680px' }}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !id.trim() || !command.trim()}>
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
            <label className="mb-1 block text-sm text-muted-foreground">{t('docker.modal.name')}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('settings.scripts.namePlaceholder')}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">{t('docker.modal.configId')}</label>
            <input
              value={id}
              onChange={e => setId(e.target.value)}
              placeholder="vscode-claude-local"
              disabled={mode === 'edit'}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{t('docker.modal.configIdHint')}</p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-muted-foreground">{t('settings.scripts.platform')}</label>
          <Select value={platform} onValueChange={value => setPlatform(value as ScriptPlatform)}>
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCRIPT_PLATFORM_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-muted-foreground">{t('common.description')}</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('common.description')}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-muted-foreground">{t('settings.scripts.command')}</label>
          <Textarea
            value={command}
            onChange={e => setCommand(e.target.value)}
            rows={4}
            placeholder={t('settings.scripts.commandPlaceholder')}
            className="font-mono text-xs"
          />
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
