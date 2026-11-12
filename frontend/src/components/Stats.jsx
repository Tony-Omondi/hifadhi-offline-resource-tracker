import { Icon } from './Icon'
import { expiryStatus, stockStatus } from '../lib/format'

function Stat({ icon, label, value, tone, active, onClick, hint }) {
  const tones = {
    neutral: 'text-stone-600 bg-stone-100',
    amber: 'text-amber-700 bg-amber-50',
    rose: 'text-rose-700 bg-rose-50',
    brand: 'text-brand-700 bg-brand-50',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`card group flex items-center gap-3 p-4 text-left transition hover:ring-stone-300 ${active ? 'ring-2 ring-brand-600 hover:ring-brand-600' : ''}`}
    >
      <span className={`flex size-10 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold leading-none tracking-tight tabular-nums">{value}</span>
        <span className="mt-1 block truncate text-xs font-medium text-stone-500">{label}</span>
        {hint && <span className="sr-only">{hint}</span>}
      </span>
    </button>
  )
}

export function Stats({ items, queueLength, filter, setFilter }) {
  const low = items.filter((i) => stockStatus(i) !== 'ok').length
  const expiring = items.filter((i) => ['soon', 'expired'].includes(expiryStatus(i)?.kind)).length
  const toggle = (name) => setFilter(filter === name ? 'all' : name)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat icon="list" label="Items tracked" value={items.length} tone="neutral" active={filter === 'all'} onClick={() => setFilter('all')} />
      <Stat icon="warning" label="Low or negative stock" value={low} tone="amber" active={filter === 'low'} onClick={() => toggle('low')} hint="Show only these" />
      <Stat icon="calendar" label="Expired or expiring in 60 days" value={expiring} tone="rose" active={filter === 'expiring'} onClick={() => toggle('expiring')} hint="Show only these" />
      <Stat icon="clock" label="Changes waiting to sync" value={queueLength} tone="brand" active={filter === 'pending'} onClick={() => toggle('pending')} hint="Show only these" />
    </div>
  )
}
