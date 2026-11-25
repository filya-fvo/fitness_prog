type Item = {
  id: string;
  name: string;
  done: boolean;
  onSelect?: () => void;
};

export function WorkoutExerciseNavigation({ items, currentId }: { items: Item[]; currentId?: string }) {
  return (
    <nav aria-label="Упражнения тренировки" className="flex gap-2 overflow-x-auto pb-1">
      {items.map(({ id, name, done, onSelect }, index) => (
        <button key={id} type="button" disabled={!onSelect}
          aria-current={id === currentId ? "true" : undefined}
          aria-label={`${index + 1}. ${name}${done ? " · выполнено" : ""}`}
          title={name}
          className={`tap-target relative flex shrink-0 items-center justify-center rounded-full px-3 text-xs ${id === currentId ? "app-gradient-action text-white" : done ? "bg-tg-secondary text-tg-hint" : "bg-tg-secondary"}`}
          onClick={onSelect}
        >
          {index + 1}
          {done ? <span aria-hidden="true" className="absolute bottom-1 right-1 text-[9px] leading-none">✓</span> : null}
        </button>
      ))}
    </nav>
  );
}
