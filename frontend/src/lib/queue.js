import { STORES, done, req } from './idb'

/**
 * Durable FIFO sync queue, stored in IndexedDB.
 *
 * Order:   each op gets an auto-increment key when it is enqueued. Keys only go up,
 *          and a cursor walks them in ascending order, so ops replay in the exact order
 *          they were made, across reloads, crashes and days offline.
 * Dedup:   a unique index on op_id (the client half of the operation-ID set) refuses
 *          the same op twice, e.g. a double-tapped Save.
 * Safety:  ops are only removed after the server acknowledges them (peek, then ack),
 *          so a dropped connection never loses an op; it is simply sent again.
 *
 * Complexity (n = ops queued, IndexedDB keys are B-tree indexed):
 *   enqueue O(log n) · peek(k) O(log n + k) · ack one op O(log n) · size O(1)-ish count
 */
export class SyncQueue {
  constructor(db) {
    this.db = db
  }

  /** Add an op. Pass `tx` to make it atomic with the record write. Returns false on duplicate op_id. */
  async enqueue(op, tx) {
    const own = !tx
    tx ??= this.db.transaction(STORES.outbox, 'readwrite')
    const finished = own ? done(tx) : null
    const store = tx.objectStore(STORES.outbox)
    const existing = await req(store.index('op_id').getKey(op.op_id))
    if (existing !== undefined) {
      await finished
      return false
    }
    await req(store.add({ ...op, queued_at: Date.now() }))
    await finished
    return true
  }

  /** The oldest `limit` ops, oldest first, without removing them. */
  peek(limit = 50) {
    return new Promise((resolve, reject) => {
      const out = []
      const tx = this.db.transaction(STORES.outbox, 'readonly')
      const cursorReq = tx.objectStore(STORES.outbox).openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor || out.length >= limit) return resolve(out)
        out.push(cursor.value)
        cursor.continue()
      }
      cursorReq.onerror = () => reject(cursorReq.error)
    })
  }

  all() {
    return req(this.db.transaction(STORES.outbox).objectStore(STORES.outbox).getAll())
  }

  size() {
    return req(this.db.transaction(STORES.outbox).objectStore(STORES.outbox).count())
  }

  /** Remove acknowledged ops by op_id. Unknown ids are ignored, so acking twice is harmless. */
  async ack(opIds, tx) {
    const own = !tx
    tx ??= this.db.transaction(STORES.outbox, 'readwrite')
    const finished = own ? done(tx) : null
    const store = tx.objectStore(STORES.outbox)
    for (const opId of opIds) {
      const key = await req(store.index('op_id').getKey(opId))
      if (key !== undefined) store.delete(key)
    }
    await finished
  }

  /** Ops still waiting for one record, oldest first. */
  async pendingFor(recordId, tx) {
    tx ??= this.db.transaction(STORES.outbox, 'readonly')
    const ops = await req(tx.objectStore(STORES.outbox).index('record_id').getAll(recordId))
    return ops.sort((a, b) => a.seq - b.seq)
  }
}
