-- Migración 011: Corregir producto cartesiano en mv_eficiencia_rutas
-- Fecha: 2026-08-19
--
-- MOTIVO: la definición anterior unía asignaciones_semanales con DOS tablas
-- de cardinalidad N (sectores_asignacion y descargas) en el mismo nivel de JOIN
-- y agregaba con COUNT sobre el resultado. Eso multiplica las filas entre sí:
--
--     sectores_totales     = sectores reales × descargas reales
--     sectores_completados = completados     × descargas reales
--     num_descargas        = descargas reales × sectores reales
--
-- Verificado en datos reales: la asignación 924 declaraba 2 sectores teniendo 1
-- (1 sector × 2 descargas). El defecto queda enmascarado mientras las rutas
-- tengan un solo sector y una sola descarga, y se dispara con datos reales.
--
-- porcentaje_cumplimiento sobrevivía por casualidad, porque numerador y
-- denominador se inflaban por el mismo factor y éste se cancelaba.
--
-- SOLUCIÓN: agregar cada rama por separado con LATERAL, de modo que cada
-- subconsulta produzca exactamente una fila por asignación.
-- Alimenta RF-09 (dashboard con métricas reales).

DROP MATERIALIZED VIEW IF EXISTS public.mv_eficiencia_rutas;

CREATE MATERIALIZED VIEW public.mv_eficiencia_rutas AS
SELECT
    a.id                                   AS asignacion_id,
    a.km_recorridos,
    a.toneladas,
    EXTRACT(EPOCH FROM (a.hora_fin_real - a.hora_inicio_real)) / 60 AS tiempo_minutos,
    s.sectores_completados,
    s.sectores_totales,
    ROUND(s.sectores_completados * 100.0 / NULLIF(s.sectores_totales, 0), 2)
                                           AS porcentaje_cumplimiento,
    d.num_descargas,
    a.hora_fin_real                        AS created_at
FROM public.asignaciones_semanales a
LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE sa.estado = 'completado') AS sectores_completados,
           COUNT(*)                                         AS sectores_totales
      FROM public.sectores_asignacion sa
     WHERE sa.asignacion_id = a.id
) s ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS num_descargas
      FROM public.descargas dg
     WHERE dg.asignacion_id = a.id
) d ON TRUE
WHERE a.estado = 'completada'
WITH DATA;

-- Índice único: requisito de REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX mv_eficiencia_rutas_asignacion_id_idx
  ON public.mv_eficiencia_rutas (asignacion_id);

ANALYZE public.mv_eficiencia_rutas;
