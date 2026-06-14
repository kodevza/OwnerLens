import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { ColumnFilter } from "../../core/collectionControls";
import type { ReportObjectFieldFilterDescriptor } from "../reportTypes";

const dropdownGap = 4;
const dropdownEstimatedHeight = 272;
const viewportMargin = 16;

export function ColumnObjectFieldFilter({
  columnId,
  columnLabel,
  fields,
  filter,
  isOpen,
  onChange,
  onOpenChange
}: {
  columnId: string;
  columnLabel: string;
  fields: ReportObjectFieldFilterDescriptor[];
  filter: ColumnFilter | undefined;
  isOpen: boolean;
  onChange: (columnId: string, conditions: Array<{ fieldId: string; value: string }>) => void;
  onOpenChange: (columnId: string, isOpen: boolean) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [draftConditions, setDraftConditions] = useState<Array<{ fieldId: string; value: string }>>([]);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
    minWidth: number;
    maxWidth: number;
  } | null>(null);
  const activeConditions = filter?.type === "objectFields" ? filter.conditions : [];
  const label =
    activeConditions.length === 0
      ? "All"
      : activeConditions.length === 1
        ? formatObjectFieldConditionLabel(fields, activeConditions[0])
        : `${activeConditions.length} conditions`;

  useEffect(() => {
    if (isOpen) {
      const currentConditions = filter?.type === "objectFields" ? filter.conditions : [];
      setDraftConditions(createObjectFieldConditions(fields, currentConditions));
    }
  }, [fields, filter, isOpen]);

  function updateConditions(conditions: Array<{ fieldId: string; value: string }>) {
    setDraftConditions(conditions);
    onChange(columnId, conditions);
  }

  function updateCondition(index: number, condition: { fieldId: string; value: string }) {
    updateConditions(draftConditions.map((currentCondition, currentIndex) => (currentIndex === index ? condition : currentCondition)));
  }

  function toggleConditionOption(index: number, condition: { fieldId: string; value: string }, option: string, checked: boolean) {
    const field = fields.find((candidate) => candidate.id === condition.fieldId);
    const selectedOptions = getSelectedConditionOptions(condition.value, field?.options ?? []);
    const nextOptions = checked
      ? selectedOptions.includes(option)
        ? selectedOptions
        : [...selectedOptions, option]
      : selectedOptions.filter((selectedOption) => selectedOption !== option);

    updateCondition(index, {
      ...condition,
      value: nextOptions.map(escapeRegExp).join("|")
    });
  }

  function clearConditions() {
    setDraftConditions(createObjectFieldConditions(fields, []));
    onChange(columnId, []);
  }

  function updateMenuPosition() {
    const trigger = triggerRef.current;
    if (!trigger) {
      setMenuPosition(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const maxWidth = window.innerWidth - viewportMargin * 2;
    const minWidth = Math.min(Math.max(rect.width, 360), maxWidth);
    const preferredLeft = rect.left;
    const maxLeft = window.innerWidth - minWidth - viewportMargin;
    const left = Math.max(viewportMargin, Math.min(preferredLeft, maxLeft));
    const preferredTop = rect.bottom + dropdownGap;
    const top =
      preferredTop + dropdownEstimatedHeight > window.innerHeight && rect.top > dropdownEstimatedHeight
        ? Math.max(viewportMargin, rect.top - dropdownGap - dropdownEstimatedHeight)
        : preferredTop;

    setMenuPosition({ left, top, minWidth, maxWidth });
  }

  useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) {
        return;
      }

      onOpenChange(columnId, false);
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, [columnId, isOpen, onOpenChange]);

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        aria-label={`Filter ${columnLabel}`}
        className="h-7 w-full cursor-pointer list-none justify-between gap-1 bg-card px-1.5 py-1 font-normal shadow-sm marker:hidden"
        size="sm"
        type="button"
        variant="outline"
        onClick={() => onOpenChange(columnId, !isOpen)}
      >
        <span className="truncate">{label}</span>
        <span aria-hidden="true" className="text-muted-foreground">
          ▾
        </span>
      </Button>
      {isOpen && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[100] flex flex-col gap-2 rounded-md border border-border bg-card p-2 text-xs text-foreground shadow-lg"
              style={{
                left: menuPosition.left,
                top: menuPosition.top,
                minWidth: menuPosition.minWidth,
                maxWidth: menuPosition.maxWidth
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <Button className="px-2 py-1 text-xs" size="sm" type="button" variant="ghost" onClick={clearConditions}>
                  Clear
                </Button>
              </div>
              <div className="flex max-h-56 flex-col gap-2 overflow-auto">
                {draftConditions.map((condition, index) => {
                  const field = fields.find((candidate) => candidate.id === condition.fieldId);

                  return (
                    <div key={condition.fieldId} className="grid grid-cols-[minmax(7rem,0.9fr)_minmax(9rem,1fr)] items-center gap-2">
                      <span className="min-w-0 truncate text-muted-foreground" title={field?.label ?? condition.fieldId}>
                        {field?.label ?? condition.fieldId}
                      </span>
                      {field?.options?.length ? (
                        <div className="flex max-h-28 min-w-0 flex-col gap-1 overflow-auto rounded-md border border-input bg-card p-1">
                          {field.options.map((option) => {
                            const selectedOptions = getSelectedConditionOptions(condition.value, field.options ?? []);

                            return (
                              <label key={option} className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-muted">
                                <input
                                  checked={selectedOptions.includes(option)}
                                  className="h-3.5 w-3.5"
                                  type="checkbox"
                                  onChange={(event) => toggleConditionOption(index, condition, option, event.target.checked)}
                                />
                                <span className="break-words">{option}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <Input
                          aria-label={`${columnLabel} ${field?.label ?? condition.fieldId} value`}
                          className="h-7 min-w-0 bg-card px-1.5 py-1 text-xs shadow-none"
                          placeholder="Filter with RegExp"
                          value={condition.value}
                          onChange={(event) => updateCondition(index, { ...condition, value: event.target.value })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function createObjectFieldConditions(
  fields: ReportObjectFieldFilterDescriptor[],
  conditions: Array<{ fieldId: string; value: string }>
): Array<{ fieldId: string; value: string }> {
  const conditionByFieldId = new Map(conditions.map((condition) => [condition.fieldId, condition]));

  return fields.map((field) => ({
    fieldId: field.id,
    value: conditionByFieldId.get(field.id)?.value ?? ""
  }));
}

function formatObjectFieldConditionLabel(
  fields: ReportObjectFieldFilterDescriptor[],
  condition: { fieldId: string; value: string }
): string {
  const field = fields.find((candidate) => candidate.id === condition.fieldId);
  return `${field?.label ?? condition.fieldId}: ${condition.value}`;
}

function getSelectedConditionOptions(value: string, options: readonly string[]): string[] {
  const parts = value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  return options.filter((option) => parts.includes(option) || parts.includes(escapeRegExp(option)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
