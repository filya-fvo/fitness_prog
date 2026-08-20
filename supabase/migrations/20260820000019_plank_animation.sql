-- P2: enable the visually verified forearm-plank animation for existing catalogs.

UPDATE exercises
SET animation_url = '/exercise-gifs/2135-VBAWRPG.gif'
WHERE name_ru = 'Планка'
  AND is_deleted = FALSE
  AND animation_url IS DISTINCT FROM '/exercise-gifs/2135-VBAWRPG.gif';
