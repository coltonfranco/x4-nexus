import { useState } from "react";
import { cn } from "../lib/utils";

type Props = {
  src: string | null | undefined;
  alt: string;
  size?: number;
  className?: string;
};

export function EntityIcon({ src, alt, size = 32, className }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={cn("bg-muted rounded", className)}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
        }}
        aria-label={alt}
      />
    );
  }

  return (
    <div 
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      {!loaded && (
        <div className="absolute inset-0 bg-muted/20 animate-pulse rounded" />
      )}
      <img
        src={src}
        alt={loaded ? alt : ""}
        width={size}
        height={size}
        className={cn(
          "transition-opacity duration-300", 
          loaded ? "opacity-100" : "opacity-0"
        )}
        style={{ objectFit: "contain", width: "100%", height: "100%" }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
