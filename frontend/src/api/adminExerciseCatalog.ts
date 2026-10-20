import { listAdminExercises, type AdminExercise } from "@/api/adminExercises";

export async function fetchAdminExerciseCatalog(): Promise<AdminExercise[]> {
  const first = await listAdminExercises({ page: 1, pageSize: 100 });
  const pages = Math.max(1, Math.ceil(first.total / 100));
  if (pages > 50) throw new Error("Каталог слишком большой. Используйте редактор упражнений");
  const items = new Map(first.items.map(item => [item.id, item]));
  for (let page = 2; page <= pages; page += 1) {
    const chunk = await listAdminExercises({ page, pageSize: 100 });
    for (const item of chunk.items) items.set(item.id, item);
  }
  return [...items.values()];
}
