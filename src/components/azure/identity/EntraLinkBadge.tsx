import type { AnchorHTMLAttributes, ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import { cn } from "../../../lib/utils";

type EntraLinkBadgeProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> & {
  children: ReactNode;
  href: string;
};

export function EntraLinkBadge({ children, className, href, title, ...props }: EntraLinkBadgeProps) {
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

export function buildEntraEnterpriseApplicationPortalUrl({
  appId,
  objectId
}: {
  appId?: string | null;
  objectId: string;
}): string {
  const encodedObjectId = encodeURIComponent(objectId);
  const appIdPath = appId ? `/appId/${encodeURIComponent(appId)}` : "";

  return `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/objectId/${encodedObjectId}${appIdPath}`;
}

export function buildEntraEnterpriseApplicationPermissionsPortalUrl({
  appId,
  objectId
}: {
  appId?: string | null;
  objectId: string;
}): string {
  const encodedObjectId = encodeURIComponent(objectId);
  const appIdPath = appId ? `/appId/${encodeURIComponent(appId)}` : "";

  return `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Permissions/objectId/${encodedObjectId}${appIdPath}`;
}
