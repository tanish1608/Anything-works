import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { ElementInfo, ViewerManifest } from '../api/types'
import { attachBridge, type BridgeHost } from '../viewer/bridge'
import { colorMap } from '../viewer/filters'
import type { SiteViewer } from '../viewer/Viewer'
import ViewerCanvas from '../viewer/ViewerCanvas'

/** Chrome-less viewer for embedding (iframe / Flutter WebView). Driven entirely through viewer/bridge.ts.
 *  A Flutter WebView can expose a JavaScript channel named `SiteMeshHost` with a postMessage(msg) method. */
export default function EmbedViewerPage() {
  const { pid } = useParams()
  const [viewer, setViewer] = useState<SiteViewer | null>(null)
  const manifest = useQuery({ queryKey: ['manifest', pid], queryFn: () => api<ViewerManifest>(`/projects/${pid}/viewer`) })
  const elements = useQuery({ queryKey: ['elements', pid], queryFn: () => api<ElementInfo[]>(`/projects/${pid}/elements`) })
  const onReady = useCallback((v: SiteViewer | null) => setViewer(v), [])

  useEffect(() => {
    if (!viewer || !manifest.data || !elements.data) return
    let off: (() => void) | undefined
    Promise.all(manifest.data.layers.map(async (l) => ({ ...l, data: await (await api<Blob>(l.url.replace(/^\/api/, ''))).arrayBuffer() })))
      .then((layers) => viewer.loadLayers(layers))
      .then(() => {
        viewer.setColors(colorMap(elements.data!, true))
        const w = window as unknown as { SiteMeshHost?: { postMessage(m: string): void } }
        const host: BridgeHost = w.SiteMeshHost
          ? { postMessage: (m) => w.SiteMeshHost!.postMessage(JSON.stringify(m)) }
          : window.parent
        off = attachBridge(viewer, host)
      })
    return () => off?.()
  }, [viewer, manifest.data, elements.data])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <ViewerCanvas onReady={onReady} />
    </div>
  )
}
