import { STORES, done, openDB, req } from './idb'
import { newDeviceId, uuid } from './ids'
import { EDITABLE_FIELDS, applyLocal, rebase } from './merge'
import { SyncQueue } from './queue'

const ALL = Object.values(STORES)

/**
 * The record map plus everything that changes it.
 *
 * Record map: IndexedDB object store keyed by record id (get/put O(log n)); the UI holds
 * the same data in a JS Map for O(1) lookups. Every local change writes the new record
 * AND enqueues its op in ONE transaction: either both happen or neither does.
 *
 * Each local record carries two bookkeeping fields:
 *   _serverVersion  the last server version this device saw (sent as base_version)
 *   _pending        true while this device has unsynced ops for it
 */
export class TrackerStore {
  static async open(name) {
    const db = await openDB(name)
    const store = new TrackerStore(db)
    store.deviceId = (await store.getMeta('device_id')) ?? (await store.setMeta('device_id', newDeviceId()))
    return store
  }

  constructor(db) {
    this.db = db
    this.queue = new SyncQueue(db)
  }

  // ---------- meta ----------
  async getMeta(key) {
    const row = await req(this.db.transaction(STORES.meta).objectStore(STORES.meta).get(key))
    return row?.value
  }

  async setMeta(key, value) {
    const tx = this.db.transaction(STORES.meta, 'readwrite')
    tx.objectStore(STORES.meta).put({ key, value })
    await done(tx)
    return value
  }

  // ---------- reads ----------
  listRecords() {
    return req(this.db.transaction(STORES.records).objectStore(STORES.records).getAll())
  }

  getRecord(id) {
    return req(this.db.transaction(STORES.records).objectStore(STORES.records).get(id))
  }

  listConflicts() {
    return req(this.db.transaction(STORES.conflicts).objectStore(STORES.conflicts).getAll())
  }

  listFailed() {
    return req(this.db.transaction(STORES.failed).objectStore(STORES.failed).getAll())
  }

  // ---------- local writes (work fully offline) ----------
  async #commit(type, recordId, data) {
    const tx = this.db.transaction([STORES.records, STORES.outbox], 'readwrite')
    const finished = done(tx)
    const records = tx.objectStore(STORES.records)
    const current = await req(records.get(recordId))
    if (type !== 'create' && !current) throw new Error('Item not found')

    const op = {
      op_id: uuid(),
      type,
      record_id: recordId,
      base_version: current?._serverVersion ?? 0,
      ts: Date.now(),
      device_id: this.deviceId,
      data,
    }
    const next = applyLocal(current, op)
    records.put({ ...next, _serverVersion: current?._serverVersion ?? 0, _pending: true, _localUpdatedAt: op.ts })
    await this.queue.enqueue(op, tx)
    await finished
    return op
  }

  createItem(fields) {
    const data = { quantity: 0, category: 'other', unit: 'units', location: '', expiry_date: null, min_stock: 0, notes: '', ...fields }
    return this.#commit('create', uuid(), data)
  }

  /** Sends only the fields that actually changed, so unrelated edits on other devices merge. */
  async updateItem(id, fields) {
    const current = await this.getRecord(id)
    const changes = {}
    for (const key of EDITABLE_FIELDS) {
      if (key in fields && fields[key] !== current?.[key]) changes[key] = fields[key]
    }
    if (Object.keys(changes).length === 0) return null
    return this.#commit('update', id, changes)
  }

  adjustQuantity(id, delta, reason = '') {
    if (!Number.isInteger(delta) || delta === 0) throw new Error('Amount must be a whole number')
    return this.#commit('adjust', id, { delta, reason })
  }

  deleteItem(id) {
    return this.#commit('delete', id, {})
  }

  // ---------- applying a server reply ----------
  /**
   * One transaction: ack ops, log conflicts/rejections, merge server records, move cursor.
   * Server records are rebased under any ops this device still has queued for them.
   */
  async applySyncResponse(response) {
    const tx = this.db.transaction(ALL, 'readwrite')
    const finished = done(tx)
    const records = tx.objectStore(STORES.records)
    const conflicts = tx.objectStore(STORES.conflicts)
    const failed = tx.objectStore(STORES.failed)
    const summary = { applied: 0, merged: 0, duplicate: 0, rejected: 0, conflicts: 0, received: 0 }

    // 1. Acknowledge: every result means the server has decided that op for good.
    await this.queue.ack(response.results.map((r) => r.op_id), tx)
    for (const result of response.results) {
      summary[result.status] = (summary[result.status] ?? 0) + 1
      if (result.conflicts?.length) {
        summary.conflicts += result.conflicts.length
        conflicts.add({
          op_id: result.op_id,
          record_id: result.record_id,
          name: result.record?.name ?? '',
          conflicts: result.conflicts,
          at: Date.now(),
        })
      }
      if (result.status === 'rejected') {
        failed.put({ op_id: result.op_id, record_id: result.record_id, error: result.error, at: Date.now() })
      }
    }

    // 2. Newest server copy of every record mentioned (feed + per-op snapshots).
    const latest = new Map()
    for (const rec of [...response.results.map((r) => r.record).filter(Boolean), ...response.changes]) {
      const seen = latest.get(rec.id)
      if (!seen || rec.version >= seen.version) latest.set(rec.id, rec)
    }

    // 3. Merge into the record map, never moving a record backwards.
    for (const server of latest.values()) {
      const local = await req(records.get(server.id))
      if (local && local._serverVersion > server.version) continue
      const pending = await this.queue.pendingFor(server.id, tx)
      const merged = pending.length ? rebase(server, pending) : server
      records.put({ ...merged, _serverVersion: server.version, _pending: pending.length > 0 })
      summary.received += 1
    }

    // 4. A rejected create leaves a local-only record nobody else has: drop it.
    for (const result of response.results) {
      if (result.status === 'rejected' && !result.record) {
        const local = await req(records.get(result.record_id))
        const pending = await this.queue.pendingFor(result.record_id, tx)
        if (local && local._serverVersion === 0 && pending.length === 0) records.delete(result.record_id)
      }
    }

    tx.objectStore(STORES.meta).put({ key: 'cursor', value: response.cursor })
    await finished
    return summary
  }

  async clearLog(storeName) {
    const tx = this.db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).clear()
    await done(tx)
  }
}
