-- Migración 009: Índices de rendimiento sobre claves foráneas y columnas de filtrado
-- Fecha: 2026-08-19
-- Motivo: La base sólo tenía 7 índices además de PKs y UNIQUEs. Las consultas más
-- calientes del sistema (panel de asignaciones por fecha, panel del conductor,
-- y los dos SELECT que el simulador ejecuta cada 5 segundos por ruta activa)
-- resolvían con Seq Scan. El índice uq_ruta_fecha (ruta_fija_id, fecha) NO puede
-- servir a `WHERE fecha = $1` porque fecha es la segunda columna del compuesto.

-- ── asignaciones_semanales ────────────────────────────────────────────────
-- GET /api/asignaciones?fecha=  y  GET /api/dashboard/diario
CREATE INDEX IF NOT EXISTS idx_asignaciones_fecha
  ON public.asignaciones_semanales (fecha);

-- GET /api/conductor/mi-asignacion (consulta por conductor + día)
CREATE INDEX IF NOT EXISTS idx_asignaciones_conductor_fecha
  ON public.asignaciones_semanales (conductor_id, fecha);

-- resumeActiveSimulations() y los filtros por estado del dashboard
CREATE INDEX IF NOT EXISTS idx_asignaciones_estado_fecha
  ON public.asignaciones_semanales (estado, fecha);

CREATE INDEX IF NOT EXISTS idx_asignaciones_vehiculo
  ON public.asignaciones_semanales (vehiculo_id);

-- ── descargas ─────────────────────────────────────────────────────────────
-- El simulador consulta la última descarga de la asignación en cada tick (5s)
CREATE INDEX IF NOT EXISTS idx_descargas_asignacion
  ON public.descargas (asignacion_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_descargas_sector_asignacion
  ON public.descargas (sector_asignacion_id);

CREATE INDEX IF NOT EXISTS idx_descargas_punto_descarga
  ON public.descargas (punto_descarga_id);

-- ── incidencias_conductor ─────────────────────────────────────────────────
-- El simulador busca incidencias críticas sin resolver en cada tick (5s)
CREATE INDEX IF NOT EXISTS idx_incidencias_asignacion_resuelto
  ON public.incidencias_conductor (asignacion_id, resuelto);

-- Panel de incidencias activas del admin
CREATE INDEX IF NOT EXISTS idx_incidencias_resuelto_created
  ON public.incidencias_conductor (resuelto, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidencias_conductor
  ON public.incidencias_conductor (conductor_id);

-- ── sectores_ruta / puntos_temporales ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sectores_ruta_ruta_fija
  ON public.sectores_ruta (ruta_fija_id, orden);

CREATE INDEX IF NOT EXISTS idx_sectores_asignacion_sector
  ON public.sectores_asignacion (sector_id);

CREATE INDEX IF NOT EXISTS idx_puntos_temporales_asignacion
  ON public.puntos_temporales (asignacion_id);

CREATE INDEX IF NOT EXISTS idx_puntos_temporales_sector
  ON public.puntos_temporales (sector_id);

-- ── rutas_fijas ───────────────────────────────────────────────────────────
-- Validación "regla de oro" al crear/editar rutas y al eliminar conductor/vehículo
CREATE INDEX IF NOT EXISTS idx_rutas_fijas_conductor
  ON public.rutas_fijas (conductor_default_id);

CREATE INDEX IF NOT EXISTS idx_rutas_fijas_vehiculo
  ON public.rutas_fijas (vehiculo_id);

CREATE INDEX IF NOT EXISTS idx_rutas_fijas_jornada_activo
  ON public.rutas_fijas (jornada_id, activo);

-- ── cambios_conductor ─────────────────────────────────────────────────────
-- Verificación de "ya reasignada para esta fecha"
CREATE INDEX IF NOT EXISTS idx_cambios_conductor_ruta_fecha
  ON public.cambios_conductor (ruta_fija_id, fecha_inicio);

-- ── novedades_operativas / auditoría ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_novedades_asignacion
  ON public.novedades_operativas (asignacion_id);

CREATE INDEX IF NOT EXISTS idx_novedades_fecha
  ON public.novedades_operativas (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha
  ON public.auditoria (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario
  ON public.auditoria (usuario_id);

-- ── reportes_ciudadanos ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reportes_ciudadano
  ON public.reportes_ciudadanos (ciudadano_id);

ANALYZE;
