import Sessions from './pages/Sessions'
import Profiles from './pages/Profiles'
import Hosts from './pages/Hosts'
import Settings from './pages/Settings'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeToggle } from "@/components/theme-toggle"
import { Terminal } from "lucide-react"

function App() {
  return (
    <div className="h-full flex flex-col bg-background">
      <Tabs defaultValue="sessions" className="h-full flex flex-col">
        {/* Header with terminal aesthetic */}
        <div className="flex items-center justify-between border-b bg-card/50 backdrop-blur-sm px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <pre className="font-mono text-[10px] leading-[1.1] text-primary select-none">
{`┌┬┐┌─┐╷  ┌─╴
││││ ││  ├╴
╵ ╵└─┘└─╴└─╴`}
              </pre>
              <span className="text-xs text-muted-foreground font-mono">
                Terminal Environment Manager
              </span>
            </div>
            <TabsList className="border-0 bg-muted/50 h-9">
              <TabsTrigger value="sessions" className="font-mono text-xs px-4">
                sessions
              </TabsTrigger>
              <TabsTrigger value="profiles" className="font-mono text-xs px-4">
                profiles
              </TabsTrigger>
              <TabsTrigger value="hosts" className="font-mono text-xs px-4">
                hosts
              </TabsTrigger>
              <TabsTrigger value="settings" className="font-mono text-xs px-4">
                settings
              </TabsTrigger>
            </TabsList>
          </div>
          <ThemeToggle />
        </div>

        <TabsContent value="sessions" className="flex-1 overflow-auto p-6 mt-0">
          <Sessions />
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
