import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

type SelectionActionBarProps = {
  children: ReactNode;
  className?: string;
  errorMessage?: string;
};

export function SelectionActionBar({ children, className, errorMessage }: SelectionActionBarProps) {
  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 z-50 flex h-[120px] w-full items-center justify-end gap-4 border-t bg-background/95 px-6 shadow-lg backdrop-blur",
        className
      )}
    >
      {errorMessage ? <div className="max-w-xl text-sm text-destructive">{errorMessage}</div> : null}
      {children}
    </div>
  );
}
