import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

afterEach(() => vi.restoreAllMocks())

test('renders the shell and opens the local database with no server at all', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
  render(<App />)
  expect(screen.getByText('Hifadhi')).toBeTruthy()
  expect(await screen.findByText('No stock recorded yet')).toBeTruthy()
})
