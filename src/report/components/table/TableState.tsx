import { Card } from "../ui/card";

export function TableState({ children, variant = "empty" }: { children: string; variant?: "empty" | "error" }) {
  return (
    <Card
      className={
        variant === "error"
          ? "border-red-200 bg-red-50 p-4 text-sm text-red-900"
          : "p-8 text-center text-sm text-muted-foreground"
      }
    >
      {children}
    </Card>
  );
}
