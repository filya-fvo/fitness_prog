# API личных изменений дня программы

W1–W3: разовое и постоянное редактирование состава подключено; методы выполнения добавляются отдельно.

`GET /workouts/customizations?program_id=<uuid>&day_index=1&scope=program_day`
возвращает `program_id`, `day_index`, `scope`, `scheduled_date`, `program_version`,
`revision`, `patch`. Для `occurrence` обязательна `scheduled_date`; для `program_day` дата не задаётся.

`PUT /workouts/customizations`: те же поля контекста плюс `base_revision`, уникальный
`operation_id` (UUID), `patch`. Первая запись использует revision 0. Ответ содержит новую revision.
`DELETE` принимает такое же тело и сбрасывает только выбранную область; revision растёт,
тело правки становится пустым. Завершённые тренировки и другая область не изменяются.

Patch: `added_exercises`, `removed_exercise_ids`, `exercise_overrides`, необязательный
`exercise_order` (полный итоговый порядок). Неуказанные параметры остаются фазовыми.
`groups` зарезервировано типизированной схемой; непустые связки пока отклоняются до W4.

Доступ проверяется по текущему JWT и правам на программу; чужой user_id не принимается.
409 означает конфликт revision/состава, 422 — недопустимую правку, 404 — недоступную программу.
Повтор той же операции с тем же телом возвращает прежний результат; повтор UUID с другим телом — 409.
Сброс сохраняет tombstone/revision и не допускает повторной записи с прежней revision 0.

Порядок построения: исходный фазовый план → постоянный patch → legacy замены на дату
→ разовый patch. Одни и те же правила используются preview/start/offline preparation.
`customization_revisions` в снимке сообщает revisions применённых областей.
Планы/шаблоны каталога не меняются; старые snapshots сохраняют свои результаты.

`GET /workouts/planned-plan?include_saved_override=false` возвращает фазовый план с постоянными личными правками, но без правок на дату. Современный occurrence PUT/DELETE атомарно заменяет старый draft replacements этой даты, поскольку полный patch включает все её изменения.

Для исходного шаблона GET planned-plan принимает одновременно `include_saved_override=false` и `include_personal_override=false`. `customization_scopes` перечисляет действующие личные области, `customization_revisions` включает и tombstones.

Современный клиент передаёт `base_program_day_revision` дополнительно к revision выбранной области. Для переноса текущей разовой подготовки в постоянный план: `scope=program_day`, `promote_date`, `base_occurrence_revision`; перенос и запись постоянного patch атомарны. Другие date drafts проверяются на совместимость; при конфликте409 обе области сохраняются.

Сохранения обоих форматов используют блокировку users, затем пользователь/программа/день. Календарные перемещения переносят только date rows, сохраняя revision/tombstones; занятая подготовленная дата не перезаписывается молча. Отменённый legacy draft освобождает свой слот только при реальном переносе в него.
