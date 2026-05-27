-- Migración 005: Eliminación de dias_semana de rutas_fijas
-- Fecha: 2026-05-27
-- Motivo: La columna dias_semana (texto) fue reemplazada completamente
-- por dias_semana_arr (SMALLINT[]) con convención ISO 8601 (1=lunes...7=domingo).
-- El backend y el frontend fueron actualizados para usar el nuevo formato.
-- Esta columna ya no tiene dependencias activas.

ALTER TABLE rutas_fijas DROP COLUMN IF EXISTS dias_semana;
