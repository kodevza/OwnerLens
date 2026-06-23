import { Button } from "../ui/button";

export function TablePagination({
  count,
  page,
  pageSize,
  onPageChange
}: {
  count: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="flex items-center justify-end gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        Page {page} of {pageCount}
      </span>
      <Button
        disabled={page <= 1}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <Button
        disabled={page >= pageCount}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
