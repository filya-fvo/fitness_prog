-- Display-name correction requested during catalogue media review.
-- Keep exercise UUIDs, media URLs and workout references unchanged.
UPDATE exercises
SET name_ru = 'Молитва',
    description = replace(description, 'Скручивания на верхнем блоке', 'Молитва')
WHERE name_ru = 'Скручивания на верхнем блоке'
  AND (tags @> '["ds:0175"]'::jsonb
       OR animation_url = '/exercise-gifs/0175-WW95auq.gif');

-- Programs store a display-name snapshot alongside the stable exercise UUID.
-- Replace only that exact JSON key/value, leaving IDs and prescriptions intact.
UPDATE programs
SET structure = replace(
    structure::text,
    '"exercise_name": "Скручивания на верхнем блоке"',
    '"exercise_name": "Молитва"'
)::jsonb
WHERE structure::text LIKE '%"exercise_name": "Скручивания на верхнем блоке"%';
