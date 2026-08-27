import { Link } from "react-router-dom";

import { Header } from "@/components/layout/Header";

const SECTIONS = [
  {
    title: "С чего начать",
    steps: [
      "Заполните короткую анкету — приложение рассчитает ориентиры и предложит программу.",
      "На Главной проверьте план на сегодня и нажмите «Начать».",
      "Сон, шаги, активность и воду вносите в дневной чек-ин на Главной. Вес — в разделе замеров тела.",
    ],
  },
  {
    title: "Тренировки",
    steps: [
      "Готовую программу можно выбрать в Тренировки → Программы.",
      "Свою тренировку соберите в каталоге: выберите упражнения и нажмите «Начать».",
      "В подходе нажмите «Готово», если подсказанные значения подходят, или «Изменить».",
      "Дополнительные действия раскрываются кнопкой «Ещё» и снова сворачиваются кнопкой «Скрыть».",
    ],
  },
  {
    title: "Питание",
    steps: [
      "Откройте Питание → Добавить продукт и выберите приём пищи.",
      "Сначала попробуйте штрихкод. Если товара нет, сфотографируйте таблицу пищевой ценности.",
      "Проверьте распознанные КБЖУ на 100 г; при необходимости исправьте их вручную.",
      "Укажите фактический вес порции и нажмите «Добавить и продолжить».",
    ],
  },
  {
    title: "Прогресс и замеры",
    steps: [
      "В Прогрессе выберите показатель и период 7, 14 или 30 дней.",
      "Пустая точка на оси означает, что в этот день показатель не внесён.",
      "Обхваты добавляются отдельно: Ещё → Замеры тела.",
    ],
  },
] as const;

export function HelpPage() {
  return (
    <section className="mx-auto max-w-3xl">
      <Header title="Как пользоваться" subtitle="Короткая инструкция без технических деталей" />
      <div className="space-y-3">
        {SECTIONS.map((section, index) => (
          <details key={section.title} open={index === 0} className="rounded-2xl bg-tg-secondary p-4">
            <summary className="cursor-pointer text-sm font-semibold">{section.title}</summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-tg-hint">
              {section.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </details>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link to="/" className="rounded-xl bg-tg-button px-4 py-3 text-center text-sm font-semibold text-tg-button-text">На главную</Link>
        <Link to="/knowledge" className="rounded-xl bg-tg-secondary px-4 py-3 text-center text-sm font-medium text-tg-text underline">Справочник</Link>
      </div>
      <p className="mt-4 text-center text-xs text-tg-hint">
        Не получается выполнить действие? Откройте Главную → Обратная связь и опишите, что произошло.
      </p>
    </section>
  );
}
