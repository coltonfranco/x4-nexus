import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Icon shown when checked (right/on position). */
  iconOn?: ReactNode;
  /** Icon shown when unchecked (left/off position). */
  iconOff?: ReactNode;
};

/** A toggle switch built on a native `<button role="switch">`. */
export function Switch({
  checked,
  onCheckedChange,
  iconOn,
  iconOff,
  className,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "bg-primary" : "bg-muted-foreground/30",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none flex h-5 w-5 items-center justify-center rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      >
        {checked ? iconOn : iconOff}
      </span>
    </button>
  );
}
