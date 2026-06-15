import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        high: "border-transparent bg-emerald-100 text-emerald-800",
        medium: "border-transparent bg-amber-100 text-amber-800",
        low: "border-transparent bg-blue-100 text-blue-800",
        none: "border-transparent bg-muted text-muted-foreground",
        riskHigh: "border-transparent bg-red-100 text-red-800",
        riskMedium: "border-transparent bg-amber-100 text-amber-800",
        riskLow: "border-transparent bg-emerald-100 text-emerald-800",
        riskNone: "border-transparent bg-muted text-muted-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, onClick, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), onClick ? "cursor-pointer" : undefined, className)} onClick={onClick} {...props} />;
}
