# Визуальная система Fitness Mini App

## Базовые принципы

- Мобильная компоновка сохраняется до `md`; на desktop рабочая область ограничена `max-w-5xl`, содержательные формы — `max-w-4xl`.
- Основное действие экрана использует `bg-tg-button`; вторичные действия — `bg-tg-secondary` или текстовую ссылку.
- Минимальная высота сенсорного действия — 44 px.
- Значимый пользовательский текст не должен быть меньше 12 px.
- Состояние выбранного элемента обозначается не только цветом: используются фон, насыщенность, подпись или символ.

## Tokens

Tokens объявлены в `frontend/src/index.css`:

- spacing: `--space-page`, `--space-section`;
- radii: `--radius-card`, `--radius-control`;
- surfaces: `--surface-primary`, `--surface-secondary`, `--surface-inset`;
- border: `--border-subtle`;
- semantic colors: `--color-success`, `--color-warning`, `--color-danger`.

Для новых экранов предпочтительны классы `surface-card`, `surface-inset`, `state-success`, `state-warning`, `state-danger` и Telegram theme variables. Не задавайте отдельные серые фоны и радиусы без необходимости.

## Состояния и доступность

- Все интерактивные элементы должны иметь заметный `focus-visible`.
- Кнопки без видимого текста получают `aria-label`.
- Модальные окна используют `useModalAccessibility`: Escape, focus trap, возврат фокуса и блокировка фоновой прокрутки.
- Технические ошибки преобразуются через `toUserMessage`; подробности остаются в логах/Sentry.
- Для загрузки, меняющей структуру страницы, используется `PageSkeleton`.

