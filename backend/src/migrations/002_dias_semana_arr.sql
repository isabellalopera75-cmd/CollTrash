-- Migración 002: Migración de dias_semana a dias_semana_arr
-- Fecha: 2026-05-26

ALTER TABLE rutas_fijas
  ADD COLUMN IF NOT EXISTS dias_semana_arr SMALLINT[];

UPDATE rutas_fijas
SET dias_semana_arr = (
  SELECT array_agg(
    CASE trim(lower(day))
      WHEN 'lunes'      THEN 1
      WHEN 'martes'     THEN 2
      WHEN 'miercoles'  THEN 3
      WHEN 'miércoles'  THEN 3
      WHEN 'jueves'     THEN 4
      WHEN 'viernes'    THEN 5
      WHEN 'sabado'     THEN 6
      WHEN 'sábado'     THEN 6
      WHEN 'domingo'    THEN 7
      ELSE NULL
    END
  )
  FROM unnest(string_to_array(dias_semana, ',')) AS day
)
WHERE dias_semana IS NOT NULL;
