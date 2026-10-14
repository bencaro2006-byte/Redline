import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import './shell/shell.css'
import { App } from './App'
import { ApiProvider, resolveApi } from './lib/api'
import { AppStatusProvider } from './shell/appStatus'
import { ToastProvider } from './ui'

async function boot(): Promise<void> {
  const container = document.getElementById('root')
  if (container === null) throw new Error('#root missing from index.html')
  const root = createRoot(container)
  try {
    const { api, isMock } = await resolveApi()
    root.render(
      <StrictMode>
        <ApiProvider api={api}>
          <AppStatusProvider isMock={isMock}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AppStatusProvider>
        </ApiProvider>
      </StrictMode>,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    root.render(<div className="rl-boot">Redline could not start: {message}</div>)
  }
}

void boot()
