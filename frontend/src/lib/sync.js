/**
 * Sync engine: push the FIFO queue, pull the change feed, retry with backoff.
 *
 * One round = POST /api/sync with the oldest `batchSize` queued ops and our cursor.
 * The server applies them in order and replies with one result per op plus every record
 * that changed after our cursor. Ops leave the queue only once a reply arrives, so:
 *   - connection lost before the server got them  -> resent next time, applied once
 *   - connection lost after the server applied them -> resent, server says "duplicate"
 * Either way the end state is the same. Rounds repeat until the queue is empty and the
 * feed has no more pages.
 */
export class SyncError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.status = status
  }
}

export function httpTransport({ url = '/api/sync', timeoutMs = 15000, fetchImpl } = {}) {
  return async (body, { simulateFailure = false } = {}) => {
    const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (simulateFailure) headers['X-Simulate-Failure'] = 'drop-response'
      const res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
      if (!res.ok) {
        const detail = await res.json().then((b) => b.error).catch(() => '')
        throw new SyncError(`Server answered ${res.status}${detail ? `: ${detail}.` : '.'}`, res.status)
      }
      return await res.json()
    } catch (err) {
      if (err instanceof SyncError) throw err
      throw new SyncError(err.name === 'AbortError' ? 'Sync timed out' : 'No connection to the server')
    } finally {
      clearTimeout(timer)
    }
  }
}

export class SyncEngine {
  constructor({ store, transport, batchSize = 50, maxRounds = 20 }) {
    this.store = store
    this.transport = transport
    this.batchSize = batchSize
    this.maxRounds = maxRounds
    this.running = null
  }

  /** Runs one full sync. Calls made while one is running share it (no overlapping pushes). */
  sync(options = {}) {
    this.running ??= this.#run(options).finally(() => {
      this.running = null
    })
    return this.running
  }

  async #run({ simulateFailure = false } = {}) {
    const total = { rounds: 0, sent: 0, applied: 0, merged: 0, duplicate: 0, rejected: 0, conflicts: 0, received: 0 }
    for (let round = 0; round < this.maxRounds; round++) {
      const ops = (await this.store.queue.peek(this.batchSize)).map(({ seq, queued_at, ...op }) => op)
      const cursor = (await this.store.getMeta('cursor')) ?? 0
      const response = await this.transport(
        { device_id: this.store.deviceId, cursor, ops },
        { simulateFailure: simulateFailure && round === 0 },
      )
      const summary = await this.store.applySyncResponse(response)
      total.rounds += 1
      total.sent += ops.length
      for (const key of Object.keys(summary)) total[key] = (total[key] ?? 0) + summary[key]

      const left = await this.store.queue.size()
      if (left === 0 && !response.has_more) break
    }
    await this.store.setMeta('last_sync', Date.now())
    return total
  }
}

/** 2s, 4s, 8s ... capped at 60s, with jitter so many devices don't retry in lockstep. */
export function backoffDelay(attempt) {
  const base = Math.min(60000, 2000 * 2 ** attempt)
  return Math.round(base * (0.8 + Math.random() * 0.4))
}
