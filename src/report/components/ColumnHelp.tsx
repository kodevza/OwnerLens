import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ReportColumnHelp } from "../reportTypes";

const tooltipWidth = 320;
const tooltipGap = 8;
const viewportMargin = 16;

export function ColumnHelp({ label, help }: { label: string; help: ReportColumnHelp }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(null);

  function showTooltip() {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const maxLeft = window.innerWidth - tooltipWidth - viewportMargin;
    const preferredLeft = rect.right - tooltipWidth;
    const left = Math.max(viewportMargin, Math.min(preferredLeft, maxLeft));
    const preferredTop = rect.bottom + tooltipGap;
    const top =
      preferredTop + tooltipGap > window.innerHeight
        ? Math.max(viewportMargin, rect.top - tooltipGap)
        : preferredTop;

    setTooltipPosition({ left, top });
  }

  function hideTooltip() {
    setTooltipPosition(null);
  }

  return (
    <span className="inline-flex shrink-0" onBlur={hideTooltip} onFocus={showTooltip} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
      <span
        ref={triggerRef}
        aria-label={`${label} column information`}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-input bg-card text-[10px] font-semibold leading-none text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="button"
        tabIndex={0}
      >
        i
      </span>
      {tooltipPosition
        ? createPortal(
            <ColumnHelpTooltip help={help} label={label} left={tooltipPosition.left} top={tooltipPosition.top} />,
            document.body
          )
        : null}
    </span>
  );
}

function ColumnHelpTooltip({
  label,
  help,
  left,
  top
}: {
  label: string;
  help: ReportColumnHelp;
  left: number;
  top: number;
}) {
  const logic = help.logic ?? [];

  return (
    <span
      className="pointer-events-none fixed z-[100] block w-80 max-w-[calc(100vw-2rem)] whitespace-normal rounded-md border border-border bg-card p-3 text-left text-xs font-normal leading-5 text-foreground shadow-lg"
      role="tooltip"
      style={{ left, top }}
    >
      <span className="mb-2 block font-semibold text-foreground">{label}</span>
      <span className="block">
        <span className="font-semibold text-muted-foreground">Source: </span>
        {help.source}
      </span>
      {help.field ? (
        <span className="block">
          <span className="font-semibold text-muted-foreground">Attribute: </span>
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{help.field}</code>
        </span>
      ) : null}
      <span className="mt-2 block font-semibold text-muted-foreground">Logic:</span>
      <ul className="m-0 mt-1 list-disc space-y-1 pl-4">
        {logic.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </span>
  );
}
