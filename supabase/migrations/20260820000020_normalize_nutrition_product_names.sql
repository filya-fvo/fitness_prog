-- Decode common HTML entities accidentally stored in supplier product names.
UPDATE nutrition_products
SET name_ru = btrim(
  regexp_replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(name_ru, '&amp;', '&'),
              '&quot;', '"'
            ),
            '&#39;', ''''
          ),
          '&apos;', ''''
        ),
        '&lt;', '<'
      ),
      '&gt;', '>'
    ),
    '\s+',
    ' ',
    'g'
  )
)
WHERE name_ru ~ '&(amp|quot|#39|apos|lt|gt);';
