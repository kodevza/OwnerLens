import type { AnchorHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/utils";

type AzureLinkBadgeProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> & {
  children: ReactNode;
  href: string;
};

export function AzureLinkBadge({ children, className, href, title, ...props }: AzureLinkBadgeProps) {
  return (
    <a
      className={cn("text-current no-underline hover:text-blue-800 hover:no-underline focus-visible:text-blue-800", className)}
      {...props}
      href={href}
      rel="noreferrer"
      target="_blank"
      title={title}
    >
      {children}
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
