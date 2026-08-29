-- Migración 015: una sola pausa de descarga abierta por asignación
-- Fecha: 2026-08-19
--
-- MOTIVO: registrarDescarga insertaba sin comprobar si ya había una pausa sin
-- cerrar. Dos toques seguidos en el móvil abrían dos descargas sobre la misma
-- asignación, y el simulador sólo sigue la última (ORDER BY dd.id DESC LIMIT 1):
-- la primera quedaba abierta para siempre, sin hora_regreso y sin toneladas,
-- reteniendo el avance de la ruta y falseando el total recolectado.
--
-- El índice parcial es la garantía real. La comprobación previa en el
-- controlador deja una ventana entre el SELECT y el INSERT que dos peticiones
-- simultáneas atraviesan a la vez; aquí la segunda choca contra la restricción.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_descarga_abierta_por_asignacion
  ON public.descargas (asignacion_id)
  WHERE hora_regreso IS NULL;

COMMENT ON INDEX public.uq_descarga_abierta_por_asignacion IS
  'Impide dos pausas de descarga sin cerrar sobre la misma asignación (RF-34 a RF-38).';

COMMIT;
