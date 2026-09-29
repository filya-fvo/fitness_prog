const WEEK_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function ProgramWeekPreview({ trainingDays }: { trainingDays: number }) {
  const count = Math.min(7, Math.max(0, trainingDays));
  const scheduled = new Set(Array.from({ length: count }, (_, slot) => Math.floor(slot * 7 / count)));

  return <div className="rounded-xl border border-sky-300/15 bg-[#0d2544]/90 px-3 py-2.5 text-white">
    <p className="text-xs font-semibold">План на неделю · пример ритма</p>
    <div className="mt-2 grid grid-cols-7 gap-1 text-center">
      {WEEK_DAYS.map((day, index) => <div key={day} className="min-w-0">
        <span className="block text-[10px] text-white/65">{day}</span>
        <span className={`mx-auto mt-1 block h-3.5 w-3.5 rounded-full ${scheduled.has(index) ? "bg-gradient-to-br from-orange-500 to-pink-600 shadow-[0_0_9px_rgba(232,61,129,.5)]" : "bg-[#7094c9]"}`}
          aria-label={`${day}: ${scheduled.has(index) ? "тренировка" : "отдых"}`} />
      </div>)}
    </div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/70">
      <span><i aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-pink-500" />Тренировка</span>
      <span><i aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-[#7094c9]" />Отдых</span>
    </div>
  </div>;
}
