import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ElementInfo, ViewerManifest } from '../api/types'
import type { SiteViewer } from './Viewer'

/** Load a project's model (current or a given version) into a viewer. */
export function useModel(viewer: SiteViewer | null, projectId: string, versionId?: string) {
  const q = versionId ? `?version=${versionId}` : ''
  const manifest = useQuery({ queryKey: ['manifest', projectId, versionId], queryFn: () => api<ViewerManifest>(`/projects/${projectId}/viewer${q}`) })
  const elements = useQuery({ queryKey: ['elements', projectId, versionId], queryFn: () => api<ElementInfo[]>(`/projects/${projectId}/elements${q}`) })
  const [loaded, setLoaded] = useState(false)
  const key = manifest.data?.layers.map((l) => l.url).join('|')
  useEffect(() => {
    if (!viewer || !manifest.data) return
    let cancelled = false
    setLoaded(false)
    Promise.all(manifest.data.layers.map(async (l) => ({ ...l, data: await (await api<Blob>(l.url.replace(/^\/api/, ''))).arrayBuffer() })))
      .then((layers) => (cancelled ? undefined : viewer.loadLayers(layers)))
      .then(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [viewer, key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { manifest: manifest.data, elements: elements.data ?? [], loaded }
}
