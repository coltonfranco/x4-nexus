import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

// Shared shell for the "click a row, see a panel" pattern: a sr-only title/description
// (the panel itself renders the visible heading) inside a Dialog gated on `open`.
// `contentClassName` is per-site since panel content varies from a compact ship card to
// a scrollable ware/module detail view.
export function DetailDialog({
  open,
  onOpenChange,
  title,
  description,
  contentClassName = "sm:max-w-2xl md:max-w-3xl",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName}>
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
