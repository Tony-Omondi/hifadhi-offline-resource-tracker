import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

afterEach(() => vi.restoreAllMocks())

test('shows backend health from /health', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ status: 'ok' }) })
  render(<App />)
  expect(await screen.findByText('ok')).toBeTruthy()
})

test('says unreachable when /health fails (offline)', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
  render(<App />)
  expect(await screen.findByText('unreachable')).toBeTruthy()
})
