import { useEffect, useState } from 'react'

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export default function App() {
  const online = useOnlineStatus()
  const [health, setHealth] = useState('checking')

  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then((b) => setHealth(b.status))
      .catch(() => setHealth('unreachable'))
  }, [online])

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Offline Resource Tracker</h1>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {online ? 'Online' : 'Offline'}
        </span>
      </header>
      <p className="mt-6 text-slate-600">
        Backend health: <span data-testid="health" className="font-mono">{health}</span>
      </p>
    </main>
  )
}
