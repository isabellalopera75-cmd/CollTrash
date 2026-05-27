-- Migración 004: Eliminación de conductor_id y vehiculo_id de asignaciones_semanales
-- Fecha: 2026-05-26
-- Motivo: Estas columnas son redundantes. El conductor y vehículo se obtienen
-- siempre a través de rutas_fijas mediante ruta_fija_id.
-- El backend fue refactorizado para usar JOIN con rutas_fijas en todos los puntos.

ALTER TABLE asignaciones_semanales 
  DROP COLUMN IF EXISTS conductor_id,
  DROP COLUMN IF EXISTS vehiculo_id;
