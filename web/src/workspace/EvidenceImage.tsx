import { useState } from "react";

/** Failure never substitutes unrelated evidence or a successful assessment. */
export default function EvidenceImage({
  src,
  alt,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [failedSource, setFailedSource] = useState<string | undefined>();
  const [loadedSource, setLoadedSource] = useState<string | undefined>();
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
      <img
        {...props}
        src={src}
        alt={alt}
        onLoad={() => setLoadedSource(src)}
        onError={() => setFailedSource(src)}
      />
    </span>
  );
}
