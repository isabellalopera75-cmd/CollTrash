-- Migración 006: Reemplazar tabla eficiencia_rutas por vista materializada
-- Fecha: 2026-05-27
-- Motivo: La tabla eficiencia_rutas almacenaba datos calculables desde
-- sectores_asignacion y asignaciones_semanales, generando riesgo de desfase.
-- Se reemplaza por una vista materializada que se refresca automáticamente
-- al finalizar cada ruta desde conductorController.js.

-- Crear vista materializada
CREATE MATERIALIZED VIEW public.mv_eficiencia_rutas AS
SELECT
    a.id AS asignacion_id,
    a.km_recorridos,
    NULL::numeric(6,2) AS toneladas,
    EXTRACT(EPOCH FROM (a.hora_fin_real - a.hora_inicio_real)) / 60 AS tiempo_minutos,
    COUNT(sa.id) FILTER (WHERE sa.estado = 'completado') AS sectores_completados,
    COUNT(sa.id) AS sectores_totales,
    ROUND(
        COUNT(sa.id) FILTER (WHERE sa.estado = 'completado') * 100.0
        / NULLIF(COUNT(sa.id), 0), 2
    ) AS porcentaje_cumplimiento,
    COUNT(d.id) AS num_descargas,
    MAX(a.hora_fin_real) AS created_at
FROM public.asignaciones_semanales a
LEFT JOIN public.sectores_asignacion sa ON sa.asignacion_id = a.id
LEFT JOIN public.descargas d ON d.asignacion_id = a.id
WHERE a.estado = 'completada'
GROUP BY a.id, a.km_recorridos, a.hora_inicio_real, a.hora_fin_real
WITH DATA;

CREATE UNIQUE INDEX ON public.mv_eficiencia_rutas(asignacion_id);

-- Eliminar tabla original (ya no necesaria)
DROP TABLE IF EXISTS public.eficiencia_rutas;
