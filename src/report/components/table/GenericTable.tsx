import { GenericRemoteTable } from "./GenericRemoteTable";
import { GenericTableView } from "./GenericTableView";
import type { GenericRemoteTableProps, GenericTableWrapperProps } from "./types";

export function isRemoteTableProps<TRow>(
  props: GenericTableWrapperProps<TRow>
): props is GenericRemoteTableProps<TRow> {
  return "loadPage" in props;
}

export function GenericTable<TRow>(props: GenericTableWrapperProps<TRow>) {
  if (isRemoteTableProps(props)) {
    return <GenericRemoteTable {...props} />;
  }

  return <GenericTableView {...props} rows={props.rows ?? []} />;
}
