import * as React from "react"
import { cn } from "../../lib/utils"

export const PageTabs = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("mt-4 flex flex-wrap gap-1", className)}
      {...props}
    />
  )
)
PageTabs.displayName = "PageTabs"

export interface PageTabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export const PageTab = React.forwardRef<HTMLButtonElement, PageTabProps>(
  ({ className, active, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    />
  )
)
PageTab.displayName = "PageTab"
