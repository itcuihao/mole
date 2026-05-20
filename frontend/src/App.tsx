import { useEffect, useState } from 'react'
import Sessions from './pages/Sessions'
import Profiles from './pages/Profiles'
import Hosts from './pages/Hosts'
import Settings from './pages/Settings'
import { MoleMascot } from './components/mole-mascot'
import { MoleRunnerGame } from './components/game/MoleRunnerGame'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MoleMessageProvider } from '@/lib/mole-messages'
import { Environment, EventsOn } from '../wailsjs/runtime/runtime'
import { useTranslation } from './i18n/context'
import { Users, Server, Settings as SettingsIcon, Mountain } from "lucide-react"

export type AppTab = 'sessions' | 'profiles' | 'hosts' | 'settings'

export type NavigateContext = {
  returnToNewSession?: boolean
  sessionDraft?: {
    profileID: string
    runMode: string
    hostID: string
    command: string
    cwd?: string
    sessionName: string
  } | null
}

function App() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<AppTab>('sessions')
  const [newSessionSignal, setNewSessionSignal] = useState(0)
  const [burrowRefreshSignal, setBurrowRefreshSignal] = useState(0)
  const [navigateContext, setNavigateContext] = useState<NavigateContext | null>(null)
  const [isMacDesktop, setIsMacDesktop] = useState(false)
  const [gameOpen, setGameOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof (window as any)?.runtime?.Environment !== 'function') {
      return
    }

    let cancelled = false

    void Environment()
      .then(info => {
        if (!cancelled) {
          setIsMacDesktop(info.platform === 'darwin')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsMacDesktop(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof (window as any)?.runtime?.EventsOnMultiple !== 'function') {
      return
    }

    const detach = EventsOn('tray:new-session', () => {
      setNavigateContext(null)
      setActiveTab('sessions')
      setNewSessionSignal(prev => prev + 1)
    })

    return () => {
      if (typeof detach === 'function') {
        detach()
      }
    }
  }, [])

  const handleNavigate = (tab: AppTab, ctx?: NavigateContext) => {
    setNavigateContext(ctx || null)
    setActiveTab(tab)
  }

  const handleReturnFromConfig = () => {
    if (navigateContext?.returnToNewSession) {
      setNavigateContext(null)
      setActiveTab('sessions')
      setNewSessionSignal(prev => prev + 1)
    }
  }

  const handleBackToSessions = () => {
    if (navigateContext?.returnToNewSession) {
      setNavigateContext(null)
      setActiveTab('sessions')
      setNewSessionSignal(prev => prev + 1)
    } else {
      setActiveTab('sessions')
    }
  }

  const iconButtonClass = (tab: AppTab) =>
    `flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
      activeTab === tab
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
    }`

  return (
    <MoleMessageProvider>
    <div className="h-full min-w-0 flex flex-col bg-background">
      <Tabs
        value={activeTab}
        onValueChange={value => { setNavigateContext(null); setActiveTab(value as AppTab) }}
        className="h-full min-w-0 flex flex-col"
      >
        {/* Header with terminal aesthetic */}
        <div className="drag-region flex items-center justify-between border-b border-border/80 bg-card/85 px-4 py-3 shadow-sm backdrop-blur-md">
          <div className="no-drag flex min-w-0 flex-1 items-center gap-3 overflow-x-auto pr-2">
            {isMacDesktop ? (
              <>
                <div aria-hidden="true" className="h-8 w-[78px] shrink-0" />
                <div aria-hidden="true" className="h-5 w-px shrink-0 bg-border/70" />
              </>
            ) : null}
            <div className="flex shrink-0 items-center gap-2">
              <div role="img" aria-label="Mole">
                <pre className="font-mono text-[7px] leading-[0.88] text-primary/85 select-none" aria-hidden="true">
{`┌┬┐┌─┐╷  ┌─╴
││││ ││  ├╴
╵ ╵└─┘└─╴└─╴`}
                </pre>
              </div>
            </div>
            <div aria-hidden="true" className="h-5 w-px shrink-0 bg-border/70" />
            <TabsList className="no-drag h-9 shrink-0 border-0 bg-transparent p-0">
              <TabsTrigger
                value="sessions"
                className="px-3.5 data-[state=active]:bg-[hsl(var(--selected))] data-[state=active]:text-[hsl(var(--selected-foreground))]"
                aria-label={t('nav.burrows')}
                title={t('nav.burrows')}
              >
                <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden="true">
                  <Mountain className="h-4 w-4" />
                  <span className="absolute bottom-[1px] h-1 w-1 rounded-full bg-current opacity-80" />
                </span>
              </TabsTrigger>
            </TabsList>
            <div className="no-drag flex-1 min-w-[220px] px-1">
              <MoleMascot onEnterCave={() => setGameOpen(true)} />
            </div>
          </div>
          <div className="no-drag flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => { setNavigateContext(null); setActiveTab('profiles') }}
              className={iconButtonClass('profiles')}
              aria-label={t('nav.profiles')}
              title={t('nav.profiles')}
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { setNavigateContext(null); setActiveTab('hosts') }}
              className={iconButtonClass('hosts')}
              aria-label={t('nav.hosts')}
              title={t('nav.hosts')}
            >
              <Server className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { setNavigateContext(null); setActiveTab('settings') }}
              className={iconButtonClass('settings')}
              aria-label={t('nav.settings')}
              title={t('nav.settings')}
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <TabsContent value="sessions" className="no-drag mt-0 flex-1 min-h-0 overflow-hidden p-6">
          <Sessions
            onNavigate={handleNavigate}
            newSessionSignal={newSessionSignal}
            burrowRefreshSignal={burrowRefreshSignal}
            onNewSessionSignalHandled={() => setNewSessionSignal(0)}
            onDiscard={() => {
              setNavigateContext(null)
              setNewSessionSignal(0)
              localStorage.removeItem('mole:newSessionDraft')
            }}
          />
        </TabsContent>

        <TabsContent value="profiles" className="no-drag mt-0 flex-1 min-h-0 overflow-hidden p-6">
          <Profiles refreshSignal={burrowRefreshSignal} onCreated={handleReturnFromConfig} onBack={handleBackToSessions} />
        </TabsContent>

        <TabsContent value="hosts" className="no-drag mt-0 flex-1 min-h-0 overflow-hidden p-6">
          <Hosts refreshSignal={burrowRefreshSignal} onCreated={handleReturnFromConfig} onBack={handleBackToSessions} />
        </TabsContent>

        <TabsContent value="settings" className="no-drag mt-0 flex-1 min-h-0 overflow-hidden p-6">
          <Settings onBurrowImported={() => setBurrowRefreshSignal(prev => prev + 1)} />
        </TabsContent>
      </Tabs>
    </div>
    {gameOpen && <MoleRunnerGame onClose={() => setGameOpen(false)} />}
    </MoleMessageProvider>
  )
}

export default App
