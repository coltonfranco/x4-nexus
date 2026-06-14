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
        "relative inline-flex h-[18px] w-[34px] shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "bg-accent/50" : "bg-white/[0.08]",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none flex h-[14px] w-[14px] items-center justify-center rounded-full shadow-lg ring-0 transition-transform",
          checked ? "translate-x-[16px]" : "translate-x-[2px]"
        )}
        style={{ backgroundColor: checked ? "var(--accent-light)" : "var(--text-faint)" }}
      >
        {checked ? iconOn : iconOff}
      </span>
    </button>
  );
}
