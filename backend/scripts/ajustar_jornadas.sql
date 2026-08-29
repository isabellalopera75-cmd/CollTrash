-- Ajuste de horarios de jornada
--
-- MOTIVO: Mañana (06:00-15:00) y Tarde (13:00-23:00) se solapaban dos horas.
-- El propio sistema rechaza jornadas solapadas al crearlas o editarlas
-- (verificarSolapaJornada en rutasController), de modo que los datos existentes
-- violaban la regla que el código impone: cualquier intento de editar una de
-- las dos desde el panel fallaba con un error de solapamiento.
--
-- Horarios definidos por la administración del sistema:
--   Mañana  06:00 - 13:00
--   Tarde   14:00 - 22:00

BEGIN;

UPDATE public.jornadas
   SET hora_inicio = '06:00:00', hora_limite_fin = '13:00:00'
 WHERE lower(nombre) LIKE 'ma%ana';

UPDATE public.jornadas
   SET hora_inicio = '14:00:00', hora_limite_fin = '22:00:00'
 WHERE lower(nombre) = 'tarde';

COMMIT;

-- Comprobación: no debe devolver ninguna fila.
SELECT a.nombre AS jornada_a, b.nombre AS jornada_b
  FROM public.jornadas a
  JOIN public.jornadas b ON b.id <> a.id
 WHERE (a.hora_inicio >= b.hora_inicio AND a.hora_inicio <  b.hora_limite_fin)
    OR (a.hora_limite_fin > b.hora_inicio AND a.hora_limite_fin <= b.hora_limite_fin)
    OR (a.hora_inicio <= b.hora_inicio AND a.hora_limite_fin >= b.hora_limite_fin);

SELECT id, nombre, hora_inicio, hora_limite_fin, margen_tardio_min, margen_no_asistido_min
  FROM public.jornadas ORDER BY hora_inicio;
