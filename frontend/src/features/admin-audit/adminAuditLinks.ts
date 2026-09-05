export function adminAuditObjectHref(objectType: string, objectId: string | null): string | null {
  if (!objectId) return null;
  const encodedId = encodeURIComponent(objectId);
  if (objectType === "user") return `/admin/users/${encodedId}`;
  if (objectType === "exercise") return `/admin/exercises?focus=${encodedId}`;
  if (objectType === "program") return `/admin/programs?focus=${encodedId}`;
  if (objectType === "broadcast") return `/admin/broadcasts?focus=${encodedId}`;
  return null;
}
