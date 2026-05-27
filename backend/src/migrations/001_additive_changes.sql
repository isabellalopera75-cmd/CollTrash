-- Migración 001: Cambios aditivos iniciales
-- Fecha: 2026-05-26

ALTER TABLE reportes_ciudadanos
  ADD CONSTRAINT ck_reportes_ciudadanos_id_o_nombre 
  CHECK (ciudadano_id IS NOT NULL OR nombre_ciudadano IS NOT NULL);

ALTER TABLE novedades_operativas
  DROP CONSTRAINT IF EXISTS novedades_operativas_admin_id_fkey,
  ADD CONSTRAINT novedades_operativas_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES public.usuarios(id)
    ON DELETE SET NULL;

ALTER TABLE notificaciones
  ADD CONSTRAINT ck_notificaciones_tipo
  CHECK (tipo IN ('comunidad','operativo','urgente'));

CREATE OR REPLACE FUNCTION copy_sectores_ruta_to_asignacion()
RETURNS trigger AS $$
BEGIN
  INSERT INTO sectores_asignacion (asignacion_id, sector_id)
  SELECT NEW.id, sr.id
  FROM sectores_ruta sr
  WHERE sr.ruta_fija_id = NEW.ruta_fija_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_copy_sectores
AFTER INSERT ON asignaciones_semanales
FOR EACH ROW EXECUTE FUNCTION copy_sectores_ruta_to_asignacion();
