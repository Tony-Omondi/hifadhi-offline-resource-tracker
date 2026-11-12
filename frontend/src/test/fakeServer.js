// In-memory stand-in for POST /api/sync with the same contract as the Django server:
// ops applied in order, op-ID set for dedup, per-field LWW for concurrent edits.
export function createFakeServer() {
  const records = new Map()
  const applied = new Map() // op_id -> result   (the operation-ID set)
  const log = [] // op_ids in the order they were applied
  let seq = 0
  const state = { down: false, dropNextResponse: false }

  const snapshot = (r) => {
    const { meta, ...rest } = r
    return { ...rest }
  }

  function apply(op) {
    if (applied.has(op.op_id)) {
      const prev = applied.get(op.op_id)
      return { ...prev, status: 'duplicate', original_status: prev.status, record: records.has(op.record_id) ? snapshot(records.get(op.record_id)) : null }
    }
    let rec = records.get(op.record_id)
    let result
    if (op.type === 'create') {
      if (rec) result = { status: 'rejected', error: 'exists' }
      else {
        rec = { id: op.record_id, deleted: false, ...op.data, version: 1, meta: {} }
        for (const k of Object.keys(op.data)) rec.meta[k] = { ts: op.ts, dev: op.device_id, v: 1 }
        result = { status: 'applied', conflicts: [] }
      }
    } else if (!rec) {
      result = { status: 'rejected', error: 'record not found' }
    } else if (op.type === 'adjust') {
      if (!Number.isInteger(op.data.delta) || op.data.delta === 0) result = { status: 'rejected', error: 'bad delta' }
      else {
        rec.quantity += op.data.delta
        rec.version += 1
        result = { status: 'applied', conflicts: [] }
      }
    } else {
      const changes = op.type === 'delete' ? { deleted: true } : op.data
      const v = rec.version + 1
      const conflicts = []
      let changed = false
      for (const [k, val] of Object.entries(changes)) {
        const m = rec.meta[k] ?? { ts: 0, dev: '', v: 0 }
        const causal = m.v <= op.base_version || m.dev === op.device_id
        const wins = causal || op.ts > m.ts || (op.ts === m.ts && op.device_id > m.dev)
        if (!causal && rec[k] !== val) conflicts.push({ field: k, yours: val, theirs: rec[k], winner: wins ? 'yours' : 'theirs' })
        if (wins) {
          rec[k] = val
          rec.meta[k] = { ts: op.ts, dev: op.device_id, v }
          changed = true
        }
      }
      if (changed) rec.version = v
      result = { status: conflicts.length ? 'merged' : 'applied', conflicts }
    }
    if (rec && result.status !== 'rejected') {
      rec.seq = ++seq
      records.set(rec.id, rec)
    }
    result = { op_id: op.op_id, record_id: op.record_id, conflicts: [], error: null, ...result, record: rec && result.status !== 'rejected' ? snapshot(rec) : null }
    applied.set(op.op_id, result)
    log.push(op.op_id)
    return result
  }

  async function transport(body) {
    if (state.down) throw new Error('No connection to the server')
    const results = body.ops.map(apply)
    if (state.dropNextResponse) {
      state.dropNextResponse = false
      throw new Error('connection dropped after apply')
    }
    const changes = [...records.values()].filter((r) => r.seq > body.cursor).sort((a, b) => a.seq - b.seq).map(snapshot)
    return { results, changes, cursor: changes.at(-1)?.seq ?? body.cursor, has_more: false, server_time: Date.now() }
  }

  return { transport, records, applied, log, state }
}

let n = 0
export const freshDbName = () => `test-db-${Date.now()}-${n++}`
