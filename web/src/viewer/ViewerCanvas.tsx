import { useEffect, useRef } from 'react'
import { SiteViewer } from './Viewer'

/** Mounts a SiteViewer into a div and hands it to the parent once. */
export default function ViewerCanvas({ onReady, onError }: { onReady: (v: SiteViewer | null) => void; onError?: (e: unknown) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const ready = useRef(onReady)
  const failed = useRef(onError)
  useEffect(() => {
    let v: SiteViewer | null = null
    try {
      v = new SiteViewer(ref.current!)
    } catch (e) {
      console.error('WebGL viewer failed to start', e)
      failed.current?.(e)
    }
    ready.current(v)
    return () => {
      ready.current(null)
      v?.dispose()
    }
  }, [])
  return <div ref={ref} className="viewer-canvas" data-testid="viewer" />
}
