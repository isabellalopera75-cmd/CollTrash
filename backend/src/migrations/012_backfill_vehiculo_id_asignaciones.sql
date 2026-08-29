-- Migración 012: Rellenar vehiculo_id en asignaciones históricas
-- Fecha: 2026-08-19
--
-- MOTIVO: cronService construía cada asignación con su vehiculo_id pero la
-- sentencia INSERT no incluía esa columna, de modo que todas las asignaciones
-- generadas por el cron nacían con vehiculo_id en NULL (259 de 290 filas en la
-- base de trabajo). El sistema lo compensaba con COALESCE contra rutas_fijas en
-- cada consulta, lo que hacía que un relevo de vehículo no se reflejara y que
-- las comprobaciones de disponibilidad por a.vehiculo_id no vieran nada.
--
-- Se rellena únicamente el histórico. El defecto de origen queda corregido en
-- cronService.js, que ya inserta la columna.

UPDATE public.asignaciones_semanales a
   SET vehiculo_id = rf.vehiculo_id
  FROM public.rutas_fijas rf
 WHERE rf.id = a.ruta_fija_id
   AND a.vehiculo_id IS NULL;

-- Igual para conductor_id, por si alguna fila antigua quedó sin él.
UPDATE public.asignaciones_semanales a
   SET conductor_id = rf.conductor_default_id
  FROM public.rutas_fijas rf
 WHERE rf.id = a.ruta_fija_id
   AND a.conductor_id IS NULL;

ANALYZE public.asignaciones_semanales;
