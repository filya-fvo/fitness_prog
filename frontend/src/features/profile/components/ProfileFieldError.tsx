export function ProfileFieldError({ id, error }: { id: string; error?: string }) {
  return error ? <span id={id} className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span> : null;
}
