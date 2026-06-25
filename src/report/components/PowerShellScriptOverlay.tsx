import { ChevronDown, Copy, FileTerminal, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "../../lib/utils";
import { Button } from "./ui/button";

export type SelectionPowerShellScriptAction = {
  selectionLabel: string;
  templates: SelectionPowerShellScriptTemplate[];
};

export type SelectionPowerShellScriptTemplate = {
  id: string;
  label: string;
  generate: () => Promise<{
    body: string;
    count?: number;
    fileName?: string;
  }>;
};

export function PowerShellScriptOverlay({ action }: { action: SelectionPowerShellScriptAction }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedTemplateLabel, setSelectedTemplateLabel] = useState("");
  const [scriptBody, setScriptBody] = useState("");
  const [scriptFileName, setScriptFileName] = useState("");
  const [scriptTargetCount, setScriptTargetCount] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "copying" | "copied" | "error">("idle");
  const [message, setMessage] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      if (!(event.target instanceof Node) || dropdownRef.current?.contains(event.target)) {
        return;
      }

      setIsMenuOpen(false);
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, [isMenuOpen]);

  const generateScript = useCallback(async (template: SelectionPowerShellScriptTemplate) => {
    setIsOpen(true);
    setIsMenuOpen(false);
    setSelectedTemplateLabel(template.label);
    setScriptBody("");
    setScriptFileName("");
    setScriptTargetCount(null);
    setStatus("generating");
    setMessage("");

    try {
      const script = await template.generate();
      setScriptBody(script.body);
      setScriptFileName(script.fileName ?? "");
      setScriptTargetCount(script.count ?? null);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "PowerShell script generation failed.");
    }
  }, []);

  const copyScript = useCallback(async () => {
    if (!scriptBody) {
      return;
    }

    setStatus("copying");
    setMessage("");
    try {
      await copyText(scriptBody);
      setStatus("copied");
      setMessage("Copied.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not copy PowerShell script.");
    }
  }, [scriptBody]);

  const overlay = isOpen
    ? createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4">
          <div
            aria-label="PowerShell script"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-5xl flex-col gap-4 rounded-md border bg-background p-5 shadow-xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">PowerShell script</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[selectedTemplateLabel, action.selectionLabel].filter(Boolean).join(" - ")}
                </p>
              </div>
              <Button
                aria-label="Close PowerShell script"
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => setIsOpen(false)}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>

            {status === "generating" ? <div className="text-sm text-muted-foreground">Generating...</div> : null}

            {scriptBody ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>{formatScriptSummary(scriptFileName, scriptTargetCount)}</span>
                  <Button
                    aria-label="Copy PowerShell script"
                    disabled={status === "copying"}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void copyScript();
                    }}
                  >
                    <Copy aria-hidden="true" className="mr-2 h-4 w-4" />
                    {status === "copying" ? "Copying..." : "Copy"}
                  </Button>
                </div>
                <textarea
                  aria-label="Generated PowerShell script"
                  className="min-h-[22rem] w-full flex-1 resize-y rounded-md border border-input bg-background p-3 font-mono text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  spellCheck={false}
                  value={scriptBody}
                  onChange={(event) => setScriptBody(event.target.value)}
                />
              </div>
            ) : null}

            {message ? (
              <div className={cn("text-sm", status === "error" ? "text-destructive" : "text-muted-foreground")}>
                {message}
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={dropdownRef} className="relative">
      <Button
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        aria-label={`Open PowerShell script templates for ${action.selectionLabel}`}
        type="button"
        variant="outline"
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        <FileTerminal aria-hidden="true" className="mr-2 h-4 w-4" />
        PowerShell
        <ChevronDown aria-hidden="true" className="ml-2 h-4 w-4" />
      </Button>
      {isMenuOpen ? (
        <div
          className="absolute bottom-[calc(100%+0.5rem)] right-0 z-[70] min-w-56 rounded-md border bg-card p-1 text-sm shadow-lg"
          role="menu"
        >
          {action.templates.map((template) => (
            <button
              key={template.id}
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left hover:bg-muted"
              role="menuitem"
              type="button"
              onClick={() => {
                void generateScript(template);
              }}
            >
              <FileTerminal aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <span>{template.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {overlay}
    </div>
  );
}

function formatScriptSummary(fileName: string, targetCount: number | null): string {
  const targetSummary = targetCount === null ? "" : `${targetCount} target${targetCount === 1 ? "" : "s"}`;
  return [fileName, targetSummary].filter(Boolean).join(" - ");
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
