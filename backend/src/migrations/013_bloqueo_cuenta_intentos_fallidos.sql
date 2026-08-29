-- Migración 013: Bloqueo temporal de cuenta por intentos fallidos
-- Fecha: 2026-08-19
--
-- MOTIVO: la única defensa contra fuerza bruta era un limitador por IP
-- (10 intentos cada 15 minutos). En el escenario real de uso del sistema —
-- demostración expuesta con ngrok, o varios usuarios tras un mismo NAT — todos
-- comparten dirección IP, de modo que el limitador castiga a usuarios legítimos
-- sin encarecer el ataque contra una cuenta concreta.
--
-- Con estas dos columnas el conteo pasa a ser por cuenta: cinco fallos
-- consecutivos bloquean el acceso durante quince minutos.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_hasta   TIMESTAMP;

COMMENT ON COLUMN public.usuarios.intentos_fallidos IS
  'Fallos de autenticación consecutivos. Se reinicia a 0 tras un ingreso correcto.';
COMMENT ON COLUMN public.usuarios.bloqueado_hasta IS
  'Instante hasta el cual se rechaza el ingreso. NULL si la cuenta no está bloqueada.';
