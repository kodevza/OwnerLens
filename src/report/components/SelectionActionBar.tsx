import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { PowerShellScriptOverlay, type SelectionPowerShellScriptAction } from "./PowerShellScriptOverlay";

type SelectionActionBarProps = {
  children: ReactNode;
  className?: string;
  errorMessage?: string;
  powerShellScriptAction?: SelectionPowerShellScriptAction;
};

export function SelectionActionBar({
  children,
  className,
  errorMessage,
  powerShellScriptAction
}: SelectionActionBarProps) {
  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 z-50 flex h-[80px] w-full items-center justify-end gap-4 border-t bg-background/95 py-3 pl-4 pr-[6%] shadow-lg backdrop-blur",
        className
      )}
    >
      {errorMessage ? <div className="max-w-xl text-sm text-destructive">{errorMessage}</div> : null}
      {powerShellScriptAction ? <PowerShellScriptOverlay action={powerShellScriptAction} /> : null}
      {children}
    </div>
  );
}
