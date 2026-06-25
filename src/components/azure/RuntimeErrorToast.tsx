import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { runtimeApiErrorEventName, type RuntimeApiError } from "./api";

export function RuntimeErrorToast() {
  const [error, setError] = useState<RuntimeApiError | null>(null);

  useEffect(() => {
    function handleRuntimeApiError(event: Event): void {
      setError((event as CustomEvent<RuntimeApiError>).detail);
    }

    window.addEventListener(runtimeApiErrorEventName, handleRuntimeApiError);
    return () => window.removeEventListener(runtimeApiErrorEventName, handleRuntimeApiError);
  }, []);

  if (!error) {
    return null;
  }

  return (
    <div
      className="fixed right-4 top-4 z-50 flex max-w-[min(28rem,calc(100vw-2rem))] items-start gap-3 rounded-md border border-destructive/40 bg-background px-4 py-3 text-sm text-foreground shadow-lg"
      role="alert"
    >
      <div className="min-w-0">
        <div className="font-medium text-destructive">Runtime API error</div>
        <div className="mt-1 break-words text-muted-foreground">{error.message}</div>
      </div>
      <button
        type="button"
        className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Dismiss runtime API error"
        onClick={() => setError(null)}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
