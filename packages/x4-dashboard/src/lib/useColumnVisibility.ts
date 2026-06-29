import { useEffect, useState } from "react";

export function useColumnVisibility(
  storageKey: string,
  defaults: Set<string>
): [Set<string>, (next: Set<string>) => void] {
  const [visible, setVisibleState] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return new Set<string>(parsed);
      }
    } catch {}
    return defaults;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...visible]));
    } catch {}
  }, [storageKey, visible]);

  return [visible, setVisibleState];
}
