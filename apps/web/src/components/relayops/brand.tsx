export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <img
      src="/brand/sboritm-mark-128.webp"
      srcSet="/brand/sboritm-mark-128.webp 128w, /brand/sboritm-mark-256.webp 256w"
      sizes="48px"
      width={48}
      height={48}
      alt=""
      className={`sboritm-brand-mark ${className}`}
      aria-hidden="true"
    />
  );
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`sboritm-wordmark ${compact ? "is-compact" : ""}`}>
      <BrandMark />
      <span translate="no">Сборитм</span>
    </span>
  );
}
