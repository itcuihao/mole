import { useEffect, useState } from 'react'
import Sessions from './pages/Sessions'
import Profiles from './pages/Profiles'
import Hosts from './pages/Hosts'
import Settings from './pages/Settings'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeToggle } from "@/components/theme-toggle"
import { EventsOn } from '../wailsjs/runtime/runtime'

export type AppTab = 'sessions' | 'profiles' | 'hosts' | 'settings'

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('sessions')
  const [newSessionSignal, setNewSessionSignal] = useState(0)

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
        <div className="flex items-center justify-between border-b bg-card/50 backdrop-blur-sm px-6 py-3">
          <div className="flex items-center gap-4">
            <div role="img" aria-label="Mole">
              <pre className="font-mono text-[10px] leading-[1.1] text-primary select-none" aria-hidden="true">
{`┌┬┐┌─┐╷  ┌─╴
││││ ││  ├╴
╵ ╵└─┘└─╴└─╴`}
              </pre>
            </div>
            <TabsList className="border-0 bg-muted/50 h-9">
              <TabsTrigger value="sessions" className="font-mono text-xs px-4">
                Sessions
              </TabsTrigger>
              <TabsTrigger value="profiles" className="font-mono text-xs px-4">
                Profiles
              </TabsTrigger>
              <TabsTrigger value="hosts" className="font-mono text-xs px-4">
                Hosts
              </TabsTrigger>
              <TabsTrigger value="settings" className="font-mono text-xs px-4">
                Settings
              </TabsTrigger>
            </TabsList>
          </div>
          <ThemeToggle />
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
