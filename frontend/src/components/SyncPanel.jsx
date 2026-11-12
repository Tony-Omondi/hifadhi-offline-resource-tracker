import { useState } from 'react'
import { Icon } from './Icon'
import { OP_LABELS, describeOp, timeAgo } from '../lib/format'

function Empty({ icon, text }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-stone-500">
      <Icon name={icon} size={22} className="text-stone-300" />
      {text}
    </div>
  )
}

function Queue({ queue, names }) {
  if (!queue.length) return <Empty icon="check" text="Nothing waiting. Every change on this device is on the server." />
  return (
    <ol className="max-h-80 divide-y divide-stone-100 overflow-y-auto">
      {queue.map((op, i) => (
        <li key={op.op_id} className="flex items-start gap-3 px-4 py-2.5">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-stone-100 text-[11px] font-semibold text-stone-600 tabular-nums">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <span className="font-medium">{OP_LABELS[op.type]}</span> <span className="text-stone-600">{names.get(op.record_id) ?? op.data?.name ?? 'item'}</span>
            </p>
            <p className="truncate text-xs text-stone-500">
              {describeOp(op)} · {timeAgo(op.ts)}
            </p>
          </div>
          <code className="mt-0.5 shrink-0 rounded bg-stone-50 px-1 text-[10px] text-stone-400" title={`op_id ${op.op_id}`}>{op.op_id.slice(0, 8)}</code>
        </li>
      ))}
    </ol>
  )
}

const show = (v) => (v === null || v === '' || v === undefined ? '(empty)' : v === true ? 'deleted' : String(v))

function Conflicts({ conflicts, onClear }) {
  if (!conflicts.length) return <Empty icon="merge" text="No conflicts yet. When two devices change the same field while offline, the result shows up here." />
  return (
    <div>
      <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto">
        {conflicts.map((c) => (
          <li key={c.id} className="px-4 py-3">
            <p className="flex items-center justify-between text-sm font-medium">
              {c.name || 'Item'} <span className="text-xs font-normal text-stone-400">{timeAgo(c.at)}</span>
            </p>
            {c.conflicts.map((f) => (
              <div key={f.field} className="mt-1.5 rounded-lg bg-stone-50 p-2 text-xs ring-1 ring-stone-200">
                <p className="mb-1 font-medium capitalize text-stone-700">{f.field.replaceAll('_', ' ')}</p>
                <p className={f.winner === 'yours' ? 'text-emerald-800' : 'text-stone-400 line-through'}>This device: {show(f.yours)}</p>
                <p className={f.winner === 'theirs' ? 'text-emerald-800' : 'text-stone-400 line-through'}>Other device: {show(f.theirs)}</p>
                <p className="mt-1 text-stone-500">Kept the {f.winner === 'yours' ? "this device's" : "other device's"} value: it was the later edit.</p>
              </div>
            ))}
          </li>
        ))}
      </ul>
      <div className="border-t border-stone-100 px-4 py-2 text-right">
        <button type="button" className="text-xs font-medium text-stone-500 hover:text-stone-900" onClick={onClear}>Clear log</button>
      </div>
    </div>
  )
}

function Failed({ failed, onClear }) {
  if (!failed.length) return <Empty icon="check" text="No rejected changes." />
  return (
    <div>
      <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto">
        {failed.map((f) => (
          <li key={f.op_id} className="px-4 py-2.5 text-sm">
            <p className="text-rose-800">{f.error}</p>
            <p className="text-xs text-stone-400">
              op {f.op_id.slice(0, 8)} · {timeAgo(f.at)}
            </p>
          </li>
        ))}
      </ul>
      <div className="border-t border-stone-100 px-4 py-2 text-right">
        <button type="button" className="text-xs font-medium text-stone-500 hover:text-stone-900" onClick={onClear}>Clear</button>
      </div>
    </div>
  )
}

export function SyncPanel({ tracker }) {
  const [tab, setTab] = useState('queue')
  const { queue, conflicts, failed, records } = tracker
  const names = new Map(records.map((r) => [r.id, r.name]))
  const tabs = [
    ['queue', 'Sync queue', queue.length],
    ['conflicts', 'Conflicts', conflicts.length],
    ['failed', 'Rejected', failed.length],
  ]
  return (
    <section className="card overflow-hidden" aria-label="Sync activity">
      <div className="flex gap-1 border-b border-stone-100 p-1.5" role="tablist">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition ${tab === key ? 'bg-stone-100 text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}
          >
            {label}
            <span className={`rounded-full px-1.5 text-[10px] leading-4 tabular-nums ${count ? (key === 'failed' ? 'bg-rose-100 text-rose-800' : 'bg-brand-100 text-brand-800') : 'bg-stone-100 text-stone-400'}`}>{count}</span>
          </button>
        ))}
      </div>
      {tab === 'queue' && (
        <>
          <p className="border-b border-stone-100 bg-stone-50/60 px-4 py-2 text-[11px] leading-relaxed text-stone-500">
            First in, first out. Each change leaves the queue only after the server confirms it, so nothing is lost if the connection drops.
          </p>
          <Queue queue={queue} names={names} />
        </>
      )}
      {tab === 'conflicts' && <Conflicts conflicts={conflicts} onClear={tracker.clearConflicts} />}
      {tab === 'failed' && <Failed failed={failed} onClear={tracker.clearFailed} />}
    </section>
  )
}

export function TestingTools({ tracker }) {
  const { forcedOffline, setForcedOffline, runSync, deviceId, browserOnline } = tracker
  return (
    <section className="card p-4" aria-label="Testing tools">
      <h2 className="text-sm font-semibold">Testing tools</h2>
      <p className="mt-0.5 text-xs text-stone-500">Try the offline and failure cases without unplugging anything.</p>
      <label className="mt-4 flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-medium">Work offline</span>
          <span className="block text-xs text-stone-500">Pause syncing as if there were no signal</span>
        </span>
        <span className="relative inline-flex">
          <input type="checkbox" className="peer sr-only" checked={forcedOffline} onChange={(e) => setForcedOffline(e.target.checked)} />
          <span className="h-6 w-11 rounded-full bg-stone-300 transition peer-checked:bg-amber-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600" />
          <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
        </span>
      </label>
      <div className="mt-4 border-t border-stone-100 pt-4">
        <button type="button" className="btn-secondary w-full" disabled={!browserOnline} onClick={() => runSync({ simulateFailure: true, manual: true, force: true })}>
          <Icon name="cloud-off" size={16} /> Sync, then drop the reply
        </button>
        <p className="mt-1.5 text-xs text-stone-500">Works even in offline mode. The server applies the changes but the reply is lost. The next sync resends them and the server recognises every op ID, so nothing is applied twice.</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-stone-100 pt-3 text-xs">
        <dt className="text-stone-500">This device</dt>
        <dd className="text-right font-mono text-stone-700">{deviceId}</dd>
        <dt className="text-stone-500">Browser network</dt>
        <dd className="text-right text-stone-700">{browserOnline ? 'connected' : 'disconnected'}</dd>
      </dl>
    </section>
  )
}
