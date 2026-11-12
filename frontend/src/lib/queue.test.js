import { describe, expect, test } from 'vitest'
import { openDB } from './idb'
import { SyncQueue } from './queue'
import { freshDbName } from '../test/fakeServer'

const op = (i, extra = {}) => ({ op_id: `op-${i}`, type: 'adjust', record_id: 'r1', data: { delta: i }, ...extra })

describe('SyncQueue (durable FIFO)', () => {
  test('replays ops in exactly the order they were enqueued', async () => {
    const q = new SyncQueue(await openDB(freshDbName()))
    for (const i of [3, 1, 4, 1.5, 9, 2, 6]) await q.enqueue(op(i))
    expect((await q.peek(100)).map((o) => o.op_id)).toEqual(['op-3', 'op-1', 'op-4', 'op-1.5', 'op-9', 'op-2', 'op-6'])
  })

  test('peek does not remove; only ack does, and order holds after partial acks', async () => {
    const q = new SyncQueue(await openDB(freshDbName()))
    for (let i = 1; i <= 5; i++) await q.enqueue(op(i))
    expect((await q.peek(2)).map((o) => o.op_id)).toEqual(['op-1', 'op-2'])
    expect(await q.size()).toBe(5)
    await q.ack(['op-1', 'op-2'])
    expect((await q.peek(10)).map((o) => o.op_id)).toEqual(['op-3', 'op-4', 'op-5'])
  })

  test('survives a reload: a new connection sees the same queue in the same order', async () => {
    const name = freshDbName()
    const q1 = new SyncQueue(await openDB(name))
    for (let i = 1; i <= 3; i++) await q1.enqueue(op(i))
    q1.db.close()
    const q2 = new SyncQueue(await openDB(name))
    expect((await q2.peek(10)).map((o) => o.op_id)).toEqual(['op-1', 'op-2', 'op-3'])
  })

  test('refuses the same op_id twice (client-side op-ID set)', async () => {
    const q = new SyncQueue(await openDB(freshDbName()))
    expect(await q.enqueue(op(1))).toBe(true)
    expect(await q.enqueue(op(1))).toBe(false)
    expect(await q.size()).toBe(1)
  })

  test('acking twice or acking unknown ids is harmless', async () => {
    const q = new SyncQueue(await openDB(freshDbName()))
    await q.enqueue(op(1))
    await q.enqueue(op(2))
    await q.ack(['op-1', 'nope'])
    await q.ack(['op-1'])
    expect((await q.peek(10)).map((o) => o.op_id)).toEqual(['op-2'])
  })

  test('pendingFor returns one record\'s ops oldest first', async () => {
    const q = new SyncQueue(await openDB(freshDbName()))
    await q.enqueue(op(1, { record_id: 'a' }))
    await q.enqueue(op(2, { record_id: 'b' }))
    await q.enqueue(op(3, { record_id: 'a' }))
    expect((await q.pendingFor('a')).map((o) => o.op_id)).toEqual(['op-1', 'op-3'])
  })
})
