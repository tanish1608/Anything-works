import { readFileSync } from 'node:fs'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import type { ModelDataset } from '../viewer/modelData'
import { STORE_KEY } from '../workspace/state'

const model = JSON.parse(readFileSync('public/bim-duplex/model.json', 'utf8')) as ModelDataset
vi.mock('../viewer/modelData', async (original) => ({
  ...(await original<typeof import('../viewer/modelData')>()),
  loadDemoModel: async () => model,
}))
vi.mock('../viewer/ProjectScene', () => ({ default: () => <div data-testid="project-scene" /> }))

function CurrentUrl() {
  const { pathname, search, hash } = useLocation()
  return <output data-testid="url">{pathname}{search}{hash}</output>
}
function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /><CurrentUrl /></MemoryRouter>)
}
beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  // The public workspace must not call retired authentication/project APIs.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'))
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('canonical website', () => {
  it('opens Home directly and keeps all navigation within the chosen workspace', async () => {
    renderAt('/')
    // The first visit also loads/transforms the lazy workspace module in this test worker.
    await screen.findByRole('heading', { name: 'Home' }, { timeout: 5000 })
    const nav = within(screen.getByRole('navigation', { name: 'Workspace' }))
    expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    for (const [name, path] of [['Work & Issues', '/work'], ['Building', '/building'], ['Logs', '/logs'], ['People', '/people'], ['Setup', '/setup']]) {
      expect(nav.getByRole('link', { name })).toHaveAttribute('href', path)
    }
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(globalThis.fetch).not.toHaveBeenCalled()
    await userEvent.click(nav.getByRole('link', { name: 'Building' }))
    await screen.findByRole('region', { name: 'Building viewer' })
    expect(screen.getByTestId('url')).toHaveTextContent('/building')
    await userEvent.click(screen.getByRole('link', { name: 'Everything Works AI' }))
    await screen.findByRole('heading', { name: 'Home' })
    expect(screen.getByTestId('url').textContent).toBe('/')
  })

  it('preserves a bookmarked work selection, query and fragment while retiring the demo prefix', async () => {
    renderAt('/demo/building/?work=ISS-031#workspace-main')
    await screen.findByRole('region', { name: 'Building viewer' })
    expect(screen.getByTestId('url').textContent).toBe('/building/?work=ISS-031#workspace-main')
    expect(screen.getByRole('main')).toHaveClass('simple-building-page')
  })

  it('preserves saved project records when reopening at the new root', async () => {
    const first = renderAt('/demo/setup')
    const input = await screen.findByLabelText('Project name')
    await userEvent.clear(input)
    await userEvent.type(input, 'Elm Court')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!).projectName).toBe('Elm Court')
    first.unmount()
    renderAt('/')
    await screen.findByRole('heading', { name: 'Home' })
    expect(screen.getByRole('button', { name: 'Project: Elm Court' })).toBeInTheDocument()
  })

  it.each([
    ['/logs', 'Logs'], ['/people', 'People'], ['/setup', 'Model, locations and daily updates'],
  ])('opens %s directly after a refresh', async (path, heading) => {
    renderAt(path)
    await screen.findByRole('heading', { name: heading })
    expect(screen.getByTestId('url').textContent).toBe(path)
  })

  it.each(['/demo', '/login', '/p/private/home', '/field/private/zone/room', '/q/private-token', '/embed/p/private/viewer', '/unknown-page'])('retires %s without mounting the old app', async (path) => {
    renderAt(path)
    await screen.findByRole('heading', { name: 'Home' })
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('/'))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
