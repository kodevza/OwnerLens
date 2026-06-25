import type { AnchorHTMLAttributes, ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import { cn } from "../../lib/utils";

type AzureLinkBadgeProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> & {
  children: ReactNode;
  href: string;
};

export function AzureLinkBadge({ children, className, href, title, ...props }: AzureLinkBadgeProps) {
  return (
    <a
      className={cn(
        "inline-flex max-w-full items-center gap-1 text-current no-underline hover:text-blue-800 hover:no-underline focus-visible:text-blue-800",
        className
      )}
      {...props}
      href={href}
      rel="noreferrer"
      target="_blank"
      title={title}
    >
      <span className="min-w-0 break-words">{children}</span>
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}

export function buildAzureResourceGroupPortalUrl({
  resourceGroup,
  subscriptionId
}: {
  resourceGroup: string;
  subscriptionId: string;
}): string {
  return `https://portal.azure.com/#resource/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/overview`;
}
