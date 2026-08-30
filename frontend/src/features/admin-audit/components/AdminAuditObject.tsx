import { Link } from "react-router-dom";

import { adminAuditObjectHref } from "../adminAuditLinks";

export function AdminAuditObject({
  objectType,
  objectId,
  objectLabel,
  typeLabel,
}: {
  objectType: string;
  objectId: string | null;
  objectLabel: string | null;
  typeLabel: string;
}) {
  const href = adminAuditObjectHref(objectType, objectId);
  const label = objectLabel ? `${typeLabel}: ${objectLabel}` : typeLabel;
  if (!href) {
    return <span>{label}{objectId ? ` · ${objectId}` : ""}</span>;
  }
  return (
    <span>
      <span className="block text-tg-text">{label}</span>
      <Link
        to={href}
        aria-label={`Открыть ${label}`}
        className="inline-flex min-h-11 items-center text-tg-link"
      >
        Открыть
      </Link>
    </span>
  );
}
