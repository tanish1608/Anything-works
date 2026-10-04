import { useEffect, useState } from 'react'
import { api } from '../api/client'

/** <img> for API files that need the Authorization header. */
export default function AuthImage({ src, alt, ...rest }: { src: string; alt: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    let alive = true
    api<Blob>(src.replace(/^\/api/, ''))
      .then((b) => {
        if (!alive) return
        u = URL.createObjectURL(b)
        setUrl(u)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (u) URL.revokeObjectURL(u)
    }
  }, [src])
  return url ? <img src={url} alt={alt} {...rest} /> : <span className="muted">…</span>
}
