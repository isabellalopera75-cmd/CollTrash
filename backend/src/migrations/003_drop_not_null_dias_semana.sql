-- Migración 003: Eliminar restricción NOT NULL de dias_semana
-- Fecha: 2026-05-26
-- Motivo: El backend ahora usa dias_semana_arr. La columna dias_semana
-- se mantiene temporalmente hasta que se confirme que nada depende de ella.

ALTER TABLE rutas_fijas ALTER COLUMN dias_semana DROP NOT NULL;
