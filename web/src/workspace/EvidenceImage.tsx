import { useEffect, useState } from "react";

import { api, tokenStore } from "../api/client";

/** Failure never substitutes unrelated evidence or a successful assessment. */
export default function EvidenceImage({
  src,
  alt,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [failedSource, setFailedSource] = useState<string | undefined>();
  const [loadedSource, setLoadedSource] = useState<string | undefined>();
  const [privateSource, setPrivateSource] = useState<{ source: string; url: string; epoch: number } | null>(null);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => tokenStore.subscribe(() => { setPrivateSource(null); setEpoch((n) => n + 1); }), []);
  const privatePhoto = !!src?.startsWith("/api/photos/");
  useEffect(() => {
    if (!privatePhoto || !src) return;
    let alive = true, url: string | null = null;
    api<Blob>(src.replace(/^\/api/, ""))
      .then((blob) => { if (alive) { url = URL.createObjectURL(blob); setFailedSource(undefined); setPrivateSource({ source: src, url, epoch }); } })
      .catch(() => { if (alive) setFailedSource(src); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [src, privatePhoto, epoch]);
  const actualSource = privatePhoto ? privateSource && privateSource.source === src && privateSource.epoch === epoch ? privateSource.url : undefined : src;

  if (failedSource === src)
    return (
      <span className="world-image-failure" role="status">
        Photo unavailable. The evidence record is retained; try reopening it or
        upload the photo again.
      </span>
    );
  return (
    <span className="world-image-wrap" aria-busy={loadedSource !== src}>
      {loadedSource !== src && (
        <span className="world-image-loading" aria-hidden="true">
          Loading photo…
        </span>
      )}
      {actualSource && <img
        {...props}
        src={actualSource}
        alt={alt}
        onLoad={() => setLoadedSource(src)}
        onError={() => setFailedSource(src)}
      />}
    </span>
  );
}
