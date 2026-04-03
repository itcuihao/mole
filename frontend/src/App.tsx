import Sessions from './pages/Sessions'
import Profiles from './pages/Profiles'
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
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-primary" strokeWidth={2.5} />
              <span className="font-mono font-semibold text-lg tracking-tight">
                mole
              </span>
            </div>
            <TabsList className="border-0 bg-muted/50 h-9">
              <TabsTrigger value="sessions" className="font-mono text-xs px-4">
                sessions
              </TabsTrigger>
              <TabsTrigger value="profiles" className="font-mono text-xs px-4">
                profiles
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
      </Tabs>
    </div>
  )
}

export default App
