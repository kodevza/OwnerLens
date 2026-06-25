import { useCallback, useEffect, useRef, useState } from "react";

import { createViewHistoryState, getHistoryStateView } from "../../lib/historyState";

export function useAzureViewNavigation<TView extends string>(
  initialView: TView,
  enabledViews: readonly TView[]
): {
  activeView: TView;
  activateView: (nextView: TView) => void;
  navigateBack: () => boolean;
} {
  const [activeView, setActiveView] = useState<TView>(initialView);
  const activeViewRef = useRef<TView>(initialView);
  const viewHistoryRef = useRef<TView[]>([]);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  const activateView = useCallback((nextView: TView) => {
    if (!enabledViews.includes(nextView) && !isDynamicTabView(nextView)) {
      return;
    }

    const currentView = activeViewRef.current;
    if (nextView === currentView) {
      return;
    }

    viewHistoryRef.current = [...viewHistoryRef.current, currentView];
    activeViewRef.current = nextView;
    setActiveView(nextView);
    window.history.pushState(createViewHistoryState(nextView), "", window.location.href);
  }, [enabledViews]);

  const navigateBack = useCallback((): boolean => {
    const previousView = viewHistoryRef.current.pop();
    if (!previousView) {
      return false;
    }

    activeViewRef.current = previousView;
    setActiveView(previousView);
    return true;
  }, []);

  useEffect(() => {
    window.history.replaceState(createViewHistoryState(activeViewRef.current), "", window.location.href);

    function handlePopState(event: PopStateEvent) {
      const previousView = getHistoryStateView(event.state, enabledViews);
      if (!previousView) {
        return;
      }

      const previousViewIndex = viewHistoryRef.current.lastIndexOf(previousView);
      if (previousViewIndex >= 0) {
        viewHistoryRef.current = viewHistoryRef.current.slice(0, previousViewIndex);
      }

      activeViewRef.current = previousView;
      setActiveView(previousView);
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [enabledViews]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Backspace" || event.defaultPrevented || isEditableBackspaceTarget(event.target)) {
        return;
      }

      event.preventDefault();
      navigateBack();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigateBack]);

  return {
    activeView,
    activateView,
    navigateBack
  };
}

function isDynamicTabView(view: string): boolean {
  return [
    "azureRbac:",
    "entraPermissions:",
    "ownershipEvidence:",
    "remediationPackage:"
  ].some((prefix) => view.startsWith(prefix));
}

function isEditableBackspaceTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const editableElement = target.closest("input, textarea, [contenteditable]");
  if (!(editableElement instanceof HTMLElement)) {
    return false;
  }

  if (editableElement instanceof HTMLTextAreaElement) {
    return !editableElement.disabled && !editableElement.readOnly;
  }

  if (editableElement instanceof HTMLInputElement) {
    return !editableElement.disabled && !editableElement.readOnly && isTextInputType(editableElement.type);
  }

  return editableElement.isContentEditable || isContentEditableAttribute(editableElement);
}

function isTextInputType(type: string): boolean {
  return [
    "",
    "email",
    "number",
    "password",
    "search",
    "tel",
    "text",
    "url"
  ].includes(type);
}

function isContentEditableAttribute(element: HTMLElement): boolean {
  const contentEditable = element.getAttribute("contenteditable");
  return contentEditable === "" || contentEditable === "true" || contentEditable === "plaintext-only";
}
