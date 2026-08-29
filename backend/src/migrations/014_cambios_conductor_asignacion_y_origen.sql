-- Migración 014: distinguir la reasignación manual del relevo por incidencia
-- Fecha: 2026-08-19
--
-- MOTIVO: la regla que impide reasignar dos veces la misma ruta el mismo día se
-- comprobaba contra cambios_conductor por (ruta_fija_id, fecha_inicio). En esa
-- tabla se anotan dos cosas distintas:
--
--   a) la reasignación manual que hace el administrador sobre la asignación del
--      día (RF-21), que es la que la regla quiere limitar a una;
--   b) el relevo que se genera al resolver una incidencia de accidente o falla
--      de motor (RF-46/RF-47), que no es una decisión de logística sino una
--      contingencia.
--
-- Al no distinguirlas, el relevo por accidente consumía el único cupo del día:
-- si el conductor de reemplazo también fallaba, el administrador ya no podía
-- reasignar la ruta. Justo el escenario en el que más falta hace.
--
-- SOLUCIÓN: cada cambio queda atado a la asignación concreta sobre la que se
-- produjo y declara su origen. La regla pasa a mirar sólo las reasignaciones
-- manuales de esa asignación.

BEGIN;

ALTER TABLE public.cambios_conductor
  ADD COLUMN IF NOT EXISTS asignacion_id INTEGER,
  ADD COLUMN IF NOT EXISTS origen        VARCHAR(30) NOT NULL DEFAULT 'reasignacion';

-- SET NULL y no CASCADE: si la asignación se depura (el generador semanal borra
-- las pendientes que ya no corresponden), el histórico de quién relevó a quién
-- debe sobrevivir. Es el registro que exige RF-47.
ALTER TABLE public.cambios_conductor
  DROP CONSTRAINT IF EXISTS cambios_conductor_asignacion_id_fkey;
ALTER TABLE public.cambios_conductor
  ADD CONSTRAINT cambios_conductor_asignacion_id_fkey
  FOREIGN KEY (asignacion_id) REFERENCES public.asignaciones_semanales(id) ON DELETE SET NULL;

ALTER TABLE public.cambios_conductor
  DROP CONSTRAINT IF EXISTS ck_cambios_conductor_origen;
ALTER TABLE public.cambios_conductor
  ADD CONSTRAINT ck_cambios_conductor_origen
  CHECK (origen IN ('reasignacion', 'relevo_incidencia'));

-- Reconstruir el vínculo de las filas anteriores a partir de la ruta y la fecha,
-- que es la única correlación que existía.
UPDATE public.cambios_conductor cc
   SET asignacion_id = a.id
  FROM public.asignaciones_semanales a
 WHERE cc.asignacion_id IS NULL
   AND a.ruta_fija_id = cc.ruta_fija_id
   AND a.fecha        = cc.fecha_inicio;

-- Los relevos históricos se reconocen por el texto con que los escribía el
-- resolutor de incidencias.
UPDATE public.cambios_conductor
   SET origen = 'relevo_incidencia'
 WHERE motivo LIKE 'Relevo por %';

CREATE INDEX IF NOT EXISTS idx_cambios_conductor_asignacion
  ON public.cambios_conductor (asignacion_id, origen);

COMMENT ON COLUMN public.cambios_conductor.asignacion_id IS
  'Asignación del día sobre la que se produjo el cambio. NULL si esa asignación ya fue depurada.';
COMMENT ON COLUMN public.cambios_conductor.origen IS
  'reasignacion = decisión manual del administrador (RF-21); relevo_incidencia = contingencia resuelta (RF-46).';

COMMIT;
