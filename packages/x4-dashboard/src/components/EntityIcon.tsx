import { useState } from "react";

type Props = {
  src: string | null | undefined;
  alt: string;
  size?: number;
  className?: string;
};

export function EntityIcon({ src, alt, size = 32, className }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          backgroundColor: "var(--muted)",
          flexShrink: 0,
        }}
        aria-label={alt}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain", flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
}
