-- Reinicio de datos operativos de CollTrash
--
-- Vacía todo el historial de operación dejando intacto el catálogo, de modo que
-- se pueda probar el sistema desde cero sin volver a configurarlo ni redibujar
-- el trazado georreferenciado de los sectores.
--
--   SE BORRA     asignaciones y todo lo que cuelga de ellas (sectores de
--                asignación, descargas, rastreo GPS, incidencias, puntos
--                temporales, novedades), cambios de conductor, reportes
--                ciudadanos, notificaciones y auditoría.
--
--   SE CONSERVA  usuarios, vehículos, jornadas, barrios, puntos de descarga,
--                configuración, rutas fijas y sectores_ruta con su geometría.
--
-- Tras ejecutarlo, arrancar el servidor y generar las asignaciones de la semana
-- con POST /api/test/generar-asignaciones (como administrador), o esperar al
-- cron del domingo 23:00.
--
-- ADVERTENCIA: es irreversible. Tomar un respaldo antes:
--   pg_dump -h localhost -U postgres -d colltrash -f backups/antes_del_reset.sql

BEGIN;

-- El orden respeta las claves foráneas: primero lo que depende de otras tablas.
DELETE FROM public.descargas;
DELETE FROM public.rastreo_gps;
DELETE FROM public.puntos_temporales;
DELETE FROM public.incidencias_conductor;
DELETE FROM public.novedades_operativas;
DELETE FROM public.sectores_asignacion;
DELETE FROM public.reportes_ciudadanos;
DELETE FROM public.asignaciones_semanales;
DELETE FROM public.cambios_conductor;
DELETE FROM public.notificaciones;
DELETE FROM public.auditoria;

-- Reiniciar los contadores para que los identificadores nuevos empiecen en 1 y
-- las pruebas sean legibles.
ALTER SEQUENCE public.descargas_id_seq              RESTART WITH 1;
ALTER SEQUENCE public.rastreo_gps_id_seq            RESTART WITH 1;
ALTER SEQUENCE public.puntos_temporales_id_seq      RESTART WITH 1;
ALTER SEQUENCE public.incidencias_conductor_id_seq  RESTART WITH 1;
ALTER SEQUENCE public.novedades_operativas_id_seq   RESTART WITH 1;
ALTER SEQUENCE public.sectores_asignacion_id_seq    RESTART WITH 1;
ALTER SEQUENCE public.reportes_ciudadanos_id_seq    RESTART WITH 1;
ALTER SEQUENCE public.asignaciones_semanales_id_seq RESTART WITH 1;
ALTER SEQUENCE public.cambios_conductor_id_seq      RESTART WITH 1;
ALTER SEQUENCE public.notificaciones_id_seq         RESTART WITH 1;
ALTER SEQUENCE public.auditoria_id_seq              RESTART WITH 1;

-- Las cuentas quedan sin bloqueos ni fallos acumulados de sesiones anteriores.
UPDATE public.usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL;

COMMIT;

-- La vista de eficiencia se alimenta de asignaciones completadas: queda vacía.
REFRESH MATERIALIZED VIEW public.mv_eficiencia_rutas;

ANALYZE;
