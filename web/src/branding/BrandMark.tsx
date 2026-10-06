/** Angular P from the supplied Placeholder AI identity. Decorative beside the wordmark. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/brand/mark.svg"
      alt=""
      aria-hidden="true"
      width={Math.round((size * 92) / 116)}
      height={size}
      style={{ display: "block", flexShrink: 0, filter: "brightness(0) invert(1)" }}
    />
  );
}
