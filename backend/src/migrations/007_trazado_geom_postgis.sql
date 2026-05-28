-- Migración 007: Migración de trazado_geom a PostGIS
-- Fecha: 2026-05-27
-- Motivo: La columna trazado_geom (TEXT) almacenaba coordenadas como array JSON
-- [[lat,lng],...]. Se agrega trazado_geom_geo (GEOMETRY) para consultas espaciales
-- con índice GIST. Se mantiene trazado_geom como fuente de escritura del frontend
-- hasta que el sistema esté completamente migrado.

-- Requiere PostGIS instalado:
CREATE EXTENSION IF NOT EXISTS postgis;

-- Agregar columna de geometría
ALTER TABLE sectores_ruta 
ADD COLUMN IF NOT EXISTS trazado_geom_geo GEOMETRY(LineString, 4326);

-- Poblar desde datos existentes (formato [[lat,lng],...] → LINESTRING(lng lat,...))
UPDATE sectores_ruta
SET trazado_geom_geo = ST_GeomFromText(
    'LINESTRING(' || (
        SELECT string_agg(
            (punto->1)::text || ' ' || (punto->0)::text,
            ', '
            ORDER BY ordinality
        )
        FROM jsonb_array_elements(trazado_geom::jsonb) 
        WITH ORDINALITY AS t(punto, ordinality)
    ) || ')',
    4326
)
WHERE trazado_geom IS NOT NULL;

-- Crear índice espacial GIST
CREATE INDEX IF NOT EXISTS idx_sectores_ruta_geom 
ON sectores_ruta USING GIST(trazado_geom_geo);

-- Trigger para mantener trazado_geom_geo sincronizado automáticamente
CREATE OR REPLACE FUNCTION sync_trazado_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.trazado_geom IS NOT NULL THEN
        NEW.trazado_geom_geo = ST_GeomFromText(
            'LINESTRING(' || (
                SELECT string_agg(
                    (punto->1)::text || ' ' || (punto->0)::text,
                    ', '
                    ORDER BY ordinality
                )
                FROM jsonb_array_elements(NEW.trazado_geom::jsonb) 
                WITH ORDINALITY AS t(punto, ordinality)
            ) || ')',
            4326
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_trazado_geom
    BEFORE INSERT OR UPDATE ON sectores_ruta
    FOR EACH ROW EXECUTE FUNCTION sync_trazado_geom();
