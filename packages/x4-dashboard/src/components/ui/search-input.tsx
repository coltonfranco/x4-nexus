import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { Input } from "./input";

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export function SearchInput({ containerClassName, className, ...props }: SearchInputProps) {
  return (
    <div className={cn("relative", containerClassName)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        className={cn(
          "pl-9 bg-muted/50 border-input rounded-[4px] focus-visible:ring-1 focus-visible:ring-primary/50",
          className
        )}
        {...props}
      />
    </div>
  );
}
