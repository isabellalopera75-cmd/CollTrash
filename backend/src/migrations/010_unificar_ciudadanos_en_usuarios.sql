-- Migración 010: Unificar la tabla ciudadanos dentro de usuarios
-- Fecha: 2026-08-19
--
-- MOTIVO (fallo de seguridad crítico):
-- usuarios.id y ciudadanos.id eran secuencias independientes, mientras que el JWT
-- sólo transportaba { id, rol }. Todo endpoint que filtrara por req.usuario.id sin
-- comprobar el rol trataba al ciudadano #N y al usuario #N como la misma persona.
-- En los datos reales había 7 colisiones activas, incluida ciudadano #1 contra el
-- Administrador #1: una cuenta de ciudadano leía las notificaciones del admin y
-- podía operar la ruta del conductor homónimo.
--
-- SOLUCIÓN: un único espacio de identificadores. Los ciudadanos pasan a usuarios
-- con rol 'ciudadano' y reportes_ciudadanos.ciudadano_id apunta a usuarios(id).
--
-- Cumple RF-01.2 (el rol viaja en el token para protección por middleware) y
-- RF-01.3 (registro de ciudadano con nombre, correo, contraseña y barrio).
--
-- NOTA DE DATOS: se descarta el ciudadano #2 (isabellalopera75@gmail.com), que
-- colisionaba en correo con el conductor #7, no tenía contraseña utilizable y no
-- tenía ningún reporte asociado. Decisión confirmada con la propietaria del sistema.

BEGIN;

-- ── 1. Ampliar usuarios para alojar los atributos propios del ciudadano ────
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS barrio_id   INTEGER REFERENCES public.barrios(id),
  ADD COLUMN IF NOT EXISTS foto_perfil CHARACTER VARYING(500);

-- Permitir el rol 'ciudadano' (antes sólo administrador|conductor)
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('administrador', 'conductor', 'ciudadano'));

-- ── 2. Descartar la fila en conflicto de correo ────────────────────────────
DELETE FROM public.ciudadanos
 WHERE lower(trim(email)) IN (SELECT lower(trim(email)) FROM public.usuarios);

-- ── 3. Migrar los ciudadanos restantes conservando su correlación de id ────
-- Alinear la secuencia por si alguna fila se insertó con id explícito.
SELECT setval('public.usuarios_id_seq', GREATEST((SELECT max(id) FROM public.usuarios), 1));

CREATE TEMP TABLE map_ciudadanos (viejo_id INTEGER PRIMARY KEY, nuevo_id INTEGER NOT NULL) ON COMMIT DROP;

WITH ins AS (
  INSERT INTO public.usuarios
      (nombre, email, password_hash, rol, activo, created_at, barrio_id, foto_perfil)
  SELECT c.nombre,
         lower(trim(c.email)),
         -- Los ciudadanos sin contraseña (nunca pudieron iniciar sesión: el sistema
         -- no tiene OAuth) reciben un hash bcrypt aleatorio e inservible, de modo que
         -- password_hash conserva su restricción NOT NULL y bcrypt.compare devuelve
         -- false en lugar de lanzar una excepción. El controlador de login además
         -- rechaza explícitamente estas cuentas.
         COALESCE(c.password_hash, '$2b$10$MJcrNMw0q7uOc9VhVDPkEujPCGvFYOgyRoOoKRmJtEEDXSB4zBFyq'),
         'ciudadano',
         TRUE,
         c.created_at,
         c.barrio_id,
         c.foto_perfil
    FROM public.ciudadanos c
  RETURNING id, email
)
INSERT INTO map_ciudadanos (viejo_id, nuevo_id)
SELECT c.id, ins.id
  FROM ins
  JOIN public.ciudadanos c ON lower(trim(c.email)) = ins.email;

-- ── 4. Reapuntar los reportes al nuevo identificador ───────────────────────
ALTER TABLE public.reportes_ciudadanos
  DROP CONSTRAINT IF EXISTS reportes_ciudadanos_ciudadano_id_fkey;

UPDATE public.reportes_ciudadanos r
   SET ciudadano_id = m.nuevo_id
  FROM map_ciudadanos m
 WHERE r.ciudadano_id = m.viejo_id;

-- Cualquier reporte cuyo autor ya no exista queda como anónimo: el CHECK
-- ck_reportes_ciudadanos_id_o_nombre exige id O nombre, y nombre_ciudadano persiste.
UPDATE public.reportes_ciudadanos r
   SET ciudadano_id = NULL
 WHERE r.ciudadano_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = r.ciudadano_id);

ALTER TABLE public.reportes_ciudadanos
  ADD CONSTRAINT reportes_ciudadanos_ciudadano_id_fkey
  FOREIGN KEY (ciudadano_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- ── 5. Retirar la tabla ciudadanos ─────────────────────────────────────────
DROP TABLE public.ciudadanos;

-- ── 6. Integridad de credenciales ──────────────────────────────────────────
-- El correo se comparaba con `email = $1` en login pero con lower() en
-- verificar-correo, permitiendo cuentas duplicadas que diferían sólo en mayúsculas.
UPDATE public.usuarios SET email = lower(trim(email)) WHERE email <> lower(trim(email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email_lower
  ON public.usuarios (lower(email));

-- La cédula se validaba únicamente con un SELECT previo desde authController
-- (patrón TOCTOU): dos peticiones simultáneas creaban conductores duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_cedula
  ON public.usuarios (cedula) WHERE cedula IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_rol_activo
  ON public.usuarios (rol, activo);

COMMIT;

ANALYZE public.usuarios;
ANALYZE public.reportes_ciudadanos;
