import { AppStateProvider, useAppState } from './state/AppState'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { TerminalLogProvider } from './state/TerminalLog'
import { TerminalPane } from './components/TerminalPane'
import { InstalledList } from './components/InstalledList'

function SectionContent() {
  const { section } = useAppState()
  if (section === 'installed') return <InstalledList />
  return <p className="font-mono text-sm text-store-text-2">section content goes here (Task 8+)</p>
}

export function App() {
  return (
    <AppStateProvider>
      <TerminalLogProvider>
        <div className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-store-border-strong bg-store-win text-store-text">
          <TitleBar />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-6">
              <SectionContent />
            </main>
          </div>
          <TerminalPane />
        </div>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}
