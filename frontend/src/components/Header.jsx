import { Icon } from './Icon'
import { timeAgo } from '../lib/format'

function StatusPill({ online, running, error, pending }) {
  if (!online)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
        <Icon name="cloud-off" size={16} /> Offline
      </span>
    )
  if (running)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
        <Icon name="sync" size={14} className="animate-spin [animation-duration:1.4s]" /> Syncing
      </span>
    )
  if (error)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
        <Icon name="cloud-off" size={16} /> Server unreachable
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
      <Icon name={pending ? 'cloud' : 'check'} size={15} /> {pending ? 'Online' : 'All synced'}
    </span>
  )
}

export function Header({ tracker }) {
  const { online, sync, queue, lastSync, runSync } = tracker
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-stone-100/85 backdrop-blur supports-[backdrop-filter]:bg-stone-100/70">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex size-10 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
          <Icon name="doctors-bag" size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold leading-tight tracking-tight sm:text-lg">Hifadhi</h1>
          <p className="truncate text-xs text-stone-500">Clinic & aid-point stock · works without internet</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden text-right sm:block">
            <StatusPill online={online} running={sync.running} error={sync.error} pending={queue.length} />
            <p className="mt-1 text-[11px] text-stone-500">Last sync {timeAgo(lastSync)}</p>
          </div>
          <div className="sm:hidden">
            <StatusPill online={online} running={sync.running} error={sync.error} pending={queue.length} />
          </div>
          <button
            type="button"
            className="btn-secondary relative"
            onClick={() => runSync({ manual: true })}
            disabled={sync.running}
            aria-label={`Sync now${queue.length ? `, ${queue.length} changes waiting` : ''}`}
          >
            <Icon name="sync" size={16} className={sync.running ? 'animate-spin [animation-duration:1.4s]' : ''} />
            <span className="hidden sm:inline">Sync now</span>
            {queue.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold leading-5 text-white tabular-nums">
                {queue.length}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}

export function OfflineBanner({ tracker }) {
  const { online, forcedOffline, queue, sync } = tracker
  if (online && !sync.error) return null
  const text = !online
    ? `${forcedOffline ? 'Offline mode is on.' : 'No internet connection.'} Keep working: every change is saved on this device${queue.length ? ` (${queue.length} waiting)` : ''} and will sync automatically when the connection is back.`
    : `Can't reach the server (${sync.error}). Your changes are safe on this device; retrying automatically.`
  return (
    <div className={`border-b ${online ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`} role="status">
      <div className="mx-auto flex max-w-7xl items-start gap-2.5 px-4 py-2.5 text-sm sm:px-6">
        <Icon name="cloud-off" size={18} className="mt-0.5" />
        <p>{text}</p>
      </div>
    </div>
  )
}
