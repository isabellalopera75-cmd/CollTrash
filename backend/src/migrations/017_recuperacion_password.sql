-- Migración 017: recuperación de contraseña
-- Fecha: 2026-08-29
--
-- El enlace «¿Olvidaste?» del portal y del acceso al panel era decorativo: un
-- elemento sin acción y sin nada detrás. No existía tabla, ni token, ni envío.
--
-- DECISIONES DE DISEÑO
--
-- 1. Tabla propia y no columnas en `usuarios`. Un usuario puede pedir el enlace
--    varias veces, y guardar el histórico permite invalidar los anteriores y
--    auditar el uso. En columnas sólo cabría la última petición.
--
-- 2. Se guarda el HASH del token, no el token. El valor en claro viaja una vez
--    en el correo y no vuelve a existir en el sistema: si alguien leyera esta
--    tabla no podría suplantar a nadie, igual que ocurre con las contraseñas.
--
-- 3. `usado_en` en lugar de borrar la fila: un enlace es de un solo uso y
--    conservar la marca deja constancia de cuándo se ejerció.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recuperaciones_password (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  token_hash  CHAR(64) NOT NULL,
  expira_en   TIMESTAMP NOT NULL,
  usado_en    TIMESTAMP,
  solicitado_desde VARCHAR(120),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- La búsqueda siempre es por hash del token: es el único dato que trae quien
-- abre el enlace.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recuperaciones_token
  ON public.recuperaciones_password (token_hash);

-- Para invalidar de golpe las peticiones vivas de un usuario al usar una.
CREATE INDEX IF NOT EXISTS idx_recuperaciones_usuario
  ON public.recuperaciones_password (usuario_id, usado_en);

COMMENT ON TABLE public.recuperaciones_password IS
  'Peticiones de restablecimiento de contraseña. Un enlace caduca y sólo sirve una vez.';
COMMENT ON COLUMN public.recuperaciones_password.token_hash IS
  'SHA-256 del token. El valor en claro sólo existe en el correo enviado.';
COMMENT ON COLUMN public.recuperaciones_password.solicitado_desde IS
  'Origen web desde el que se pidió, para reconstruir el enlace y para auditoría.';

COMMIT;
