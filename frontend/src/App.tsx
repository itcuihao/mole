import { useEffect, useState } from 'react'
import Sessions from './pages/Sessions'
import Profiles from './pages/Profiles'
import Hosts from './pages/Hosts'
import Settings from './pages/Settings'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeToggle } from "@/components/theme-toggle"
import { Environment, EventsOn } from '../wailsjs/runtime/runtime'

export type AppTab = 'sessions' | 'profiles' | 'hosts' | 'settings'

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('sessions')
  const [newSessionSignal, setNewSessionSignal] = useState(0)
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
      setActiveTab('sessions')
      setNewSessionSignal(prev => prev + 1)
    })

    return () => {
      if (typeof detach === 'function') {
        detach()
      }
    }
  }, [])

  return (
    <div className="h-full min-w-0 flex flex-col bg-background">
      <Tabs
        value={activeTab}
        onValueChange={value => setActiveTab(value as AppTab)}
        className="h-full min-w-0 flex flex-col"
      >
        {/* Header with terminal aesthetic */}
        <div className="flex items-center justify-between border-b bg-card/50 px-4 py-3 backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-3 overflow-x-auto pr-2">
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
            <TabsList className="h-9 shrink-0 border-0 bg-transparent p-0">
              <TabsTrigger value="sessions" className="font-mono text-xs px-3.5 data-[state=active]:bg-muted">
                Sessions
              </TabsTrigger>
              <TabsTrigger value="profiles" className="font-mono text-xs px-3.5 data-[state=active]:bg-muted">
                Profiles
              </TabsTrigger>
              <TabsTrigger value="hosts" className="font-mono text-xs px-3.5 data-[state=active]:bg-muted">
                Hosts
              </TabsTrigger>
              <TabsTrigger value="settings" className="font-mono text-xs px-3.5 data-[state=active]:bg-muted">
                Settings
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="shrink-0">
            <ThemeToggle />
          </div>
        </div>

        <TabsContent value="sessions" className="mt-0 flex-1 overflow-y-auto overflow-x-hidden p-6">
          <Sessions onNavigate={setActiveTab} newSessionSignal={newSessionSignal} />
        </TabsContent>

        <TabsContent value="profiles" className="flex-1 overflow-auto p-6 mt-0">
          <Profiles />
        </TabsContent>

        <TabsContent value="hosts" className="flex-1 overflow-auto p-6 mt-0">
          <Hosts />
        </TabsContent>

        <TabsContent value="settings" className="flex-1 overflow-auto p-6 mt-0">
          <Settings />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default App
