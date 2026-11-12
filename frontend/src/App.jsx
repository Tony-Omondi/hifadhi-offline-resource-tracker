import { useMemo, useState } from 'react'
import { AdjustDialog } from './components/AdjustDialog'
import { ConfirmDelete } from './components/ConfirmDialog'
import { Header, OfflineBanner } from './components/Header'
import { Icon } from './components/Icon'
import { ItemDialog } from './components/ItemDialog'
import { ItemList } from './components/ItemList'
import { Stats } from './components/Stats'
import { SyncPanel, TestingTools } from './components/SyncPanel'
import { Toasts, useToasts } from './components/Toasts'
import { useTracker } from './hooks/useTracker'
import { CATEGORIES, expiryStatus, stockStatus } from './lib/format'

function syncMessage(s) {
  const parts = []
  const sent = s.applied + s.merged
  if (sent) parts.push(`${sent} change${sent === 1 ? '' : 's'} sent`)
  if (s.duplicate) parts.push(`${s.duplicate} already on server (not applied twice)`)
  if (s.conflicts) parts.push(`${s.conflicts} conflict${s.conflicts === 1 ? '' : 's'} resolved`)
  if (s.rejected) parts.push(`${s.rejected} rejected`)
  return parts.length ? `Synced: ${parts.join(' · ')}` : null
}

export default function App() {
  const { toasts, push } = useToasts()
  const tracker = useTracker({
    onSynced: (summary, { manual }) => {
      const text = syncMessage(summary)
      if (text) push({ tone: summary.conflicts || summary.rejected ? 'info' : 'success', text })
      else if (manual) push({ tone: 'success', text: 'Up to date.' })
    },
    onSyncError: (error) => push({ tone: 'error', text: `${error.message} Changes are kept on this device.` }),
  })

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null) // item, or 'new'
  const [adjusting, setAdjusting] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const live = useMemo(() => tracker.records.filter((r) => !r.deleted), [tracker.records])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return live
      .filter((r) => category === 'all' || r.category === category)
      .filter((r) => !q || `${r.name} ${r.location} ${r.notes}`.toLowerCase().includes(q))
      .filter((r) => {
        if (filter === 'low') return stockStatus(r) !== 'ok'
        if (filter === 'expiring') return ['soon', 'expired'].includes(expiryStatus(r)?.kind)
        if (filter === 'pending') return r._pending
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [live, query, category, filter])

  const live_ = (id) => tracker.records.find((r) => r.id === id)

  return (
    <div className="min-h-dvh">
      <Header tracker={tracker} />
      <OfflineBanner tracker={tracker} />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <Stats items={live} queueLength={tracker.queue.length} filter={filter} setFilter={setFilter} />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="card overflow-hidden" aria-label="Stock items">
            <div className="flex flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row sm:items-center sm:px-5">
              <div className="relative flex-1">
                <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                <input
                  type="search"
                  className="field pl-9"
                  placeholder="Search items, locations, notes"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search items"
                />
              </div>
              <button type="button" className="btn-primary shrink-0" onClick={() => setEditing('new')}>
                <Icon name="plus" size={16} /> Add item
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto border-b border-stone-100 px-4 py-2.5 sm:px-5" role="group" aria-label="Category">
              {[['all', { label: 'All' }], ...Object.entries(CATEGORIES)].map(([key, c]) => {
                const count = key === 'all' ? live.length : live.filter((r) => r.category === key).length
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={category === key}
                    onClick={() => setCategory(key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${category === key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-800 hover:bg-stone-200'}`}
                  >
                    {c.icon && <Icon name={c.icon} size={16} />}
                    {c.label}
                    <span className={`tabular-nums ${category === key ? 'text-stone-300' : 'text-stone-600'}`}>{count}</span>
                  </button>
                )
              })}
            </div>
            {!tracker.ready ? (
              <ul className="divide-y divide-stone-100" aria-busy="true" aria-label="Loading items">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                    <span className="size-10 rounded-xl bg-stone-100" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3.5 w-48 max-w-full rounded bg-stone-100" />
                      <span className="block h-3 w-32 rounded bg-stone-100" />
                    </span>
                    <span className="h-12 w-36 rounded-xl bg-stone-100" />
                  </li>
                ))}
              </ul>
            ) : (
              <ItemList
                items={visible}
                totalCount={live.length}
                onAdd={() => setEditing('new')}
                onClearFilters={() => {
                  setQuery('')
                  setCategory('all')
                  setFilter('all')
                }}
                onAdjust={setAdjusting}
                onQuick={(item, delta) => tracker.adjustQuantity(item.id, delta, delta > 0 ? 'received' : 'dispensed')}
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            )}
          </section>

          <aside className="space-y-5">
            <SyncPanel tracker={tracker} />
            <TestingTools tracker={tracker} />
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 pb-4 pt-2 text-xs text-stone-600">
          <p>Built for rural clinics and aid points where the signal comes and goes · SDG 3 &amp; SDG 2</p>
          <p>
            Icons and illustrations by{' '}
            <a className="underline hover:text-stone-900" href="https://icons8.com" target="_blank" rel="noreferrer">
              Icons8
            </a>
          </p>
        </footer>
      </main>

      <ItemDialog
        open={!!editing}
        item={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSave={(fields) => (editing === 'new' ? tracker.createItem(fields) : tracker.updateItem(editing.id, fields))}
      />
      <AdjustDialog
        item={adjusting ? live_(adjusting.id) : null}
        onClose={() => setAdjusting(null)}
        onSave={(delta, reason) => tracker.adjustQuantity(adjusting.id, delta, reason)}
      />
      <ConfirmDelete item={deleting} onClose={() => setDeleting(null)} onConfirm={() => tracker.deleteItem(deleting.id)} />
      <Toasts toasts={toasts} />
    </div>
  )
}
