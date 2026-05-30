-- Migración 008: Reemplazar sector_pausa_id por sector_asignacion_id en descargas
-- Fecha: 2026-05-30
-- Motivo: La columna sector_pausa_id referenciaba sectores_ruta directamente,
-- pero la relación correcta es con sectores_asignacion para vincular la descarga
-- al progreso real de la asignación activa, no a la definición base de la ruta.

ALTER TABLE public.descargas
  DROP CONSTRAINT IF EXISTS descargas_sector_pausa_id_fkey,
  DROP COLUMN IF EXISTS sector_pausa_id,
  ADD COLUMN IF NOT EXISTS sector_asignacion_id INTEGER NOT NULL 
    REFERENCES public.sectores_asignacion(id);
