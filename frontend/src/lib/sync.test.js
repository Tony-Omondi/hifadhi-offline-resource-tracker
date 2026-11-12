import { describe, expect, test } from 'vitest'
import { TrackerStore } from './store'
import { SyncEngine, backoffDelay, httpTransport } from './sync'
import { createFakeServer, freshDbName } from '../test/fakeServer'

async function device(server, batchSize = 50) {
  const store = await TrackerStore.open(freshDbName())
  return { store, engine: new SyncEngine({ store, transport: server.transport, batchSize }) }
}

describe('SyncEngine: offline -> online', () => {
  test('offline: sync fails, nothing is lost, and the next online sync delivers it all', async () => {
    const server = createFakeServer()
    const { store, engine } = await device(server)
    const { record_id } = await store.createItem({ name: 'Paracetamol', quantity: 100 })
    await store.adjustQuantity(record_id, -20)

    server.state.down = true
    await expect(engine.sync()).rejects.toThrow('No connection')
    expect(await store.queue.size()).toBe(2)
    expect((await store.getRecord(record_id)).quantity).toBe(80)

    server.state.down = false
    const summary = await engine.sync()
    expect(summary.applied).toBe(2)
    expect(await store.queue.size()).toBe(0)
    expect(server.records.get(record_id).quantity).toBe(80)
    expect((await store.getRecord(record_id))._pending).toBe(false)
  })

  test('large queues go in batches and the server applies them in FIFO order', async () => {
    const server = createFakeServer()
    const { store, engine } = await device(server, 50)
    const { record_id } = await store.createItem({ name: 'Flour', quantity: 0 })
    for (let i = 1; i <= 119; i++) await store.adjustQuantity(record_id, i)
    const queued = (await store.queue.peek(500)).map((o) => o.op_id)

    const summary = await engine.sync()
    expect(summary.rounds).toBe(3)
    expect(server.log).toEqual(queued)
    expect(server.records.get(record_id).quantity).toBe((119 * 120) / 2)
  })

  test('connection lost after the server applied the batch: retry is deduplicated', async () => {
    const server = createFakeServer()
    const { store, engine } = await device(server)
    const { record_id } = await store.createItem({ name: 'Gauze', quantity: 50 })
    await store.adjustQuantity(record_id, -5)

    server.state.dropNextResponse = true
    await expect(engine.sync()).rejects.toThrow()
    expect(await store.queue.size()).toBe(2) // client never got the ack
    expect(server.records.get(record_id).quantity).toBe(45) // but server did apply

    const summary = await engine.sync()
    expect(summary.duplicate).toBe(2)
    expect(server.records.get(record_id).quantity).toBe(45) // -5 applied exactly once
    expect((await store.getRecord(record_id)).quantity).toBe(45)
  })

  test('two offline devices edit the same field: both converge, the loser sees a conflict', async () => {
    const server = createFakeServer()
    const a = await device(server)
    const b = await device(server)
    const { record_id } = await a.store.createItem({ name: 'RUTF', location: 'Store' })
    await a.engine.sync()
    await b.engine.sync() // b now has the record at version 1

    await a.store.updateItem(record_id, { location: 'Nutrition corner' })
    await new Promise((r) => setTimeout(r, 5))
    await b.store.updateItem(record_id, { location: 'Ward 2' }) // later edit
    await b.engine.sync()
    const resultA = await a.engine.sync()
    await b.engine.sync()

    expect(resultA.conflicts).toBe(1)
    expect((await a.store.listConflicts())[0].conflicts[0]).toMatchObject({ field: 'location', winner: 'theirs' })
    expect((await a.store.getRecord(record_id)).location).toBe('Ward 2')
    expect((await b.store.getRecord(record_id)).location).toBe('Ward 2')
  })

  test('two devices dispensing at once: both movements count', async () => {
    const server = createFakeServer()
    const a = await device(server)
    const b = await device(server)
    const { record_id } = await a.store.createItem({ name: 'ORS', quantity: 100 })
    await a.engine.sync()
    await b.engine.sync()
    await a.store.adjustQuantity(record_id, -30)
    await b.store.adjustQuantity(record_id, -25)
    await a.engine.sync()
    await b.engine.sync()
    await a.engine.sync()
    expect((await a.store.getRecord(record_id)).quantity).toBe(45)
    expect((await b.store.getRecord(record_id)).quantity).toBe(45)
  })

  test('a rejected op leaves the queue and is kept in the failed list', async () => {
    const server = createFakeServer()
    const { store, engine } = await device(server)
    await store.queue.enqueue({ op_id: 'bad-1', type: 'adjust', record_id: 'missing', base_version: 0, ts: 1, device_id: store.deviceId, data: { delta: 1 } })
    const summary = await engine.sync()
    expect(summary.rejected).toBe(1)
    expect(await store.queue.size()).toBe(0)
    expect((await store.listFailed())[0]).toMatchObject({ op_id: 'bad-1', error: 'record not found' })
  })

  test('sync calls made while one is running share it (no double push)', async () => {
    const server = createFakeServer()
    const { store, engine } = await device(server)
    await store.createItem({ name: 'Soap', quantity: 1 })
    const [x, y] = await Promise.all([engine.sync(), engine.sync()])
    expect(x).toBe(y)
    expect(server.log).toHaveLength(1)
  })
})

describe('httpTransport and backoff', () => {
  test('a non-2xx reply is an error, and the failure header is only sent when asked', async () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push(init.headers)
      return { ok: false, status: 503, json: async () => ({}) }
    }
    const t = httpTransport({ fetchImpl })
    await expect(t({ ops: [] }, { simulateFailure: true })).rejects.toThrow('503')
    await expect(t({ ops: [] })).rejects.toThrow('503')
    expect(calls[0]['X-Simulate-Failure']).toBe('drop-response')
    expect(calls[1]['X-Simulate-Failure']).toBeUndefined()
  })

  test('backoff grows and is capped at about a minute', () => {
    expect(backoffDelay(0)).toBeLessThan(backoffDelay(3))
    expect(backoffDelay(20)).toBeLessThanOrEqual(72000)
  })
})
