import { useEffect, useState } from 'react'
import Sessions from './pages/Sessions'
import Profiles from './pages/Profiles'
import Hosts from './pages/Hosts'
import Settings from './pages/Settings'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Environment, EventsOn } from '../wailsjs/runtime/runtime'
import { useTranslation } from './i18n/context'
import { Users, Server, Settings as SettingsIcon } from "lucide-react"

export type AppTab = 'sessions' | 'profiles' | 'hosts' | 'settings'

export type NavigateContext = {
  returnToNewSession?: boolean
  sessionDraft?: {
    profileID: string
    runMode: string
    hostID: string
    command: string
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
    <div className="h-full min-w-0 flex flex-col bg-background">
      <Tabs
        value={activeTab}
        onValueChange={value => { setNavigateContext(null); setActiveTab(value as AppTab) }}
        className="h-full min-w-0 flex flex-col"
      >
        {/* Header with terminal aesthetic */}
        <div className="drag-region flex items-center justify-between border-b bg-card px-4 py-3">
          <div className="no-drag flex min-w-0 items-center gap-3 overflow-x-auto pr-2">
            {isMacDesktop ? (
              <>
                <div aria-hidden="true" className="h-8 w-[78px] shrink-0" />
                <div aria-hidden="true" className="h-5 w-px shrink-0 bg-border/70" />
              </>
            ) : null}
            <div className="shrink-0" role="img" aria-label="Mole">
              <pre className="font-mono text-[7px] leading-[0.88] text-primary/90 select-none" aria-hidden="true">
{`┌┬┐┌─┐╷  ┌─╴
││││ ││  ├╴
╵ ╵└─┘└─╴└─╴`}
              </pre>
            </div>
            <div aria-hidden="true" className="h-5 w-px shrink-0 bg-border/70" />
            <TabsList className="no-drag h-9 shrink-0 border-0 bg-transparent p-0">
              <TabsTrigger value="sessions" className="font-mono text-xs px-3.5 data-[state=active]:bg-muted">
                {t('nav.burrows')}
              </TabsTrigger>
            </TabsList>
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

        <TabsContent value="sessions" className="no-drag mt-0 flex-1 overflow-y-auto overflow-x-hidden p-6">
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

        <TabsContent value="profiles" className="no-drag flex-1 overflow-auto p-6 mt-0">
          <Profiles refreshSignal={burrowRefreshSignal} onCreated={handleReturnFromConfig} onBack={handleBackToSessions} />
        </TabsContent>

        <TabsContent value="hosts" className="no-drag flex-1 overflow-auto p-6 mt-0">
          <Hosts refreshSignal={burrowRefreshSignal} onCreated={handleReturnFromConfig} onBack={handleBackToSessions} />
        </TabsContent>

        <TabsContent value="settings" className="no-drag flex-1 overflow-auto p-6 mt-0">
          <Settings onBurrowImported={() => setBurrowRefreshSignal(prev => prev + 1)} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default App
