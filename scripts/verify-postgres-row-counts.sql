\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'

SELECT format(
  'SELECT %L AS table_name, count(1) AS row_count FROM %I.%I;',
  tablename,
  schemaname,
  tablename
)
FROM pg_catalog.pg_tables
WHERE schemaname = 'public'
ORDER BY tablename
\gexec
