/**
 * postMessage bridge so a host (Flutter WebView, native app, iframe parent) can drive the viewer.
 *
 * Host → viewer:  { type: 'select', id } | { type: 'setColors', colors: {id: '#hex'} }
 *                 | { type: 'flyTo', viewpoint } | { type: 'frame', ids? } | { type: 'snapshot', requestId }
 *                 | { type: 'setVisible', ids: string[] | null } | { type: 'getViewpoint', requestId }
 * Viewer → host:  { source: 'sitemesh-viewer', type: 'ready' | 'select' | 'pick' | 'snapshot' | 'viewpoint', ... }
 */
import type { SiteViewer, Viewpoint } from './Viewer'

export type BridgeCommand =
  | { type: 'select'; id: string | null }
  | { type: 'setColors'; colors: Record<string, string> }
  | { type: 'setVisible'; ids: string[] | null }
  | { type: 'flyTo'; viewpoint: Viewpoint }
  | { type: 'frame'; ids?: string[] }
  | { type: 'snapshot'; requestId: string }
  | { type: 'getViewpoint'; requestId: string }

export interface BridgeHost {
  postMessage(msg: unknown, targetOrigin: string): void
}

export function handleCommand(viewer: SiteViewer, cmd: BridgeCommand, reply: (msg: Record<string, unknown>) => void) {
  switch (cmd.type) {
    case 'select':
      return viewer.select(cmd.id)
    case 'setColors':
      return viewer.setColors(new Map(Object.entries(cmd.colors)))
    case 'setVisible':
      return viewer.setVisible(cmd.ids ? new Set(cmd.ids) : null)
    case 'flyTo':
      return viewer.flyTo(cmd.viewpoint)
    case 'frame':
      return viewer.frame(cmd.ids)
    case 'snapshot':
      return reply({ type: 'snapshot', requestId: cmd.requestId, dataUrl: viewer.snapshot() })
    case 'getViewpoint':
      return reply({ type: 'viewpoint', requestId: cmd.requestId, viewpoint: viewer.getViewpoint() })
  }
}

export function attachBridge(viewer: SiteViewer, host: BridgeHost, origin = '*', win: Window = window): () => void {
  const send = (msg: Record<string, unknown>) => host.postMessage({ source: 'sitemesh-viewer', ...msg }, origin)
  const onMessage = (e: MessageEvent) => {
    if (origin !== '*' && e.origin !== origin) return
    const cmd = e.data as BridgeCommand
    if (cmd && typeof cmd === 'object' && typeof cmd.type === 'string') handleCommand(viewer, cmd, send)
  }
  win.addEventListener('message', onMessage)
  const offs = [
    viewer.on('select', (id) => send({ type: 'select', id })),
    viewer.on('pick', (hit) => send({ type: 'pick', ...hit })),
  ]
  send({ type: 'ready' })
  return () => {
    win.removeEventListener('message', onMessage)
    offs.forEach((off) => off())
  }
}
