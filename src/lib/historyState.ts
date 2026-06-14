export type ViewHistoryState<TView extends string> = {
  ownerLensView: TView;
};

export function createViewHistoryState<TView extends string>(view: TView): ViewHistoryState<TView> {
  return {
    ownerLensView: view
  };
}

export function getHistoryStateView<TView extends string>(state: unknown, views: readonly TView[]): TView | null {
  if (!isViewHistoryState(state, views)) {
    return null;
  }

  return state.ownerLensView;
}

function isViewHistoryState<TView extends string>(
  state: unknown,
  views: readonly TView[]
): state is ViewHistoryState<TView> {
  if (!state || typeof state !== "object" || !("ownerLensView" in state)) {
    return false;
  }

  return views.includes((state as ViewHistoryState<TView>).ownerLensView);
}
