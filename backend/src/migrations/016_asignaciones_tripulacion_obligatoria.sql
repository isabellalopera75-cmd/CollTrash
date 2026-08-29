-- Migración 016: la tripulación de la asignación deja de ser opcional
-- Fecha: 2026-08-28
--
-- MOTIVO (defecto estructural, no un fallo suelto):
--
-- El sistema tenía dos fuentes de verdad para la misma pregunta —¿quién conduce
-- esta ruta?—:
--
--   · rutas_fijas.conductor_default_id     el PLAN:  quién debería conducirla
--   · asignaciones_semanales.conductor_id  el HECHO: quién la condujo ese día
--
-- Ambas columnas existían, ambas con nombres razonables y ambas a un JOIN de
-- distancia. Quien escribía una consulta nueva podía elegir la equivocada sin
-- notarlo: la consulta funcionaba, devolvía filas, y sólo mentía cuando había
-- habido un relevo. Ocurrió tres veces en sitios distintos —bitácora de
-- novedades, panel de incidencias e informe de eficiencia— y ninguna prueba lo
-- detectó, porque el resultado era plausible.
--
-- La raíz estaba en que asignaciones_semanales.conductor_id admitía NULL: una
-- vía de creación (atender un reporte ciudadano sobre una fecha sin asignación)
-- insertaba sin tripulación. Como podían existir nulos, TODA consulta necesitaba
-- COALESCE contra rutas_fijas, y de ahí salía el atajo de unir directamente
-- contra la ruta fija.
--
-- SOLUCIÓN: cerrada esa vía en el controlador, la asignación siempre nace con su
-- conductor y su vehículo. Al declararlos obligatorios, asignaciones_semanales
-- pasa a ser la única fuente de verdad de la operación, y unir contra
-- rutas_fijas para saber quién condujo deja de ser un error sutil para ser un
-- error evidente.
--
-- Verificado antes de aplicar: ninguna fila con nulos, y las dos columnas de
-- rutas_fijas de las que se copia ya son NOT NULL, de modo que el relleno de
-- seguridad no puede dejar huecos.

BEGIN;

-- ── 1. Red de seguridad: rellenar cualquier fila heredada sin tripulación ──
UPDATE public.asignaciones_semanales a
   SET conductor_id = COALESCE(a.conductor_id, rf.conductor_default_id),
       vehiculo_id  = COALESCE(a.vehiculo_id,  rf.vehiculo_id)
  FROM public.rutas_fijas rf
 WHERE rf.id = a.ruta_fija_id
   AND (a.conductor_id IS NULL OR a.vehiculo_id IS NULL);

-- ── 2. La tripulación pasa a ser obligatoria ──────────────────────────────
ALTER TABLE public.asignaciones_semanales
  ALTER COLUMN conductor_id SET NOT NULL,
  ALTER COLUMN vehiculo_id  SET NOT NULL;

-- ── 3. Dejar la intención escrita en el propio esquema ────────────────────
-- Es lo primero que lee quien inspecciona la base sin conocer el dominio.
COMMENT ON COLUMN public.rutas_fijas.conductor_default_id IS
  'PLANTILLA de la ruta: conductor con el que se generan las asignaciones. NO usar en informes ni en la operación del día; para eso está asignaciones_semanales.conductor_id, que refleja los relevos y las reasignaciones.';

COMMENT ON COLUMN public.rutas_fijas.vehiculo_id IS
  'PLANTILLA de la ruta: vehículo con el que se generan las asignaciones. NO usar en informes ni en la operación del día; para eso está asignaciones_semanales.vehiculo_id.';

COMMENT ON COLUMN public.asignaciones_semanales.conductor_id IS
  'Conductor que realmente tiene la jornada, ya sea el titular, un reasignado o un relevo por incidencia. Fuente de verdad para monitoreo, informes y permisos (RNF-12).';

COMMENT ON COLUMN public.asignaciones_semanales.vehiculo_id IS
  'Vehículo que realmente cubre la jornada, incluidos los reemplazos por avería. Fuente de verdad para monitoreo e informes (RNF-12).';

COMMIT;

ANALYZE public.asignaciones_semanales;
