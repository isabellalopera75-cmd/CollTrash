import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { verificarTokenRecuperacion, restablecerPassword } from '../services/api';

/**
 * Pantalla a la que lleva el enlace del correo de recuperación.
 *
 * Es pública y común a los tres roles: el enlace no sabe —ni necesita saber— si
 * quien lo abre es un ciudadano, un conductor o el administrador.
 *
 * Lo primero que hace es preguntar al servidor si el enlace sigue sirviendo. Sin
 * esa comprobación previa, el usuario escribiría una contraseña nueva para
 * enterarse al enviarla de que el enlace había caducado hace media hora.
 */
export default function RestablecerPassword() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get('token');

  const [estado, setEstado] = useState('verificando'); // verificando | valido | invalido | listo
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = 'var(--fondo)';

    if (!token) {
      setEstado('invalido');
      setMensaje('El enlace está incompleto. Vuelve a solicitarlo desde la pantalla de acceso.');
      return undefined;
    }

    verificarTokenRecuperacion(token)
      .then(res => {
        setNombre(res.data.nombre || '');
        setEstado('valido');
      })
      .catch(err => {
        setEstado('invalido');
        setMensaje(err.response?.data?.mensaje || 'No pudimos validar el enlace. Solicita uno nuevo.');
      });

    return () => { document.body.style.backgroundColor = prevBg; };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      return setError('La contraseña debe tener al menos 6 caracteres.');
    }
    // Se compara antes de enviar: es un error del usuario y no hace falta
    // gastar un viaje al servidor para señalarlo.
    if (password !== confirmacion) {
      return setError('Las dos contraseñas no coinciden.');
    }

    setEnviando(true);
    try {
      const res = await restablecerPassword({ token, password });
      setMensaje(res.data.mensaje);
      setEstado('listo');
    } catch (err) {
      if (!err.response) {
        setError('No se pudo contactar con el servidor. Revisa tu conexión.');
      } else {
        setError(err.response.data?.mensaje || 'No se pudo actualizar la contraseña.');
      }
    } finally {
      setEnviando(false);
    }
  };

  const s = {
    marco: {
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--e-4)', background: 'var(--superficie-2)', fontFamily: 'var(--f-texto)'
    },
    tarjeta: {
      width: '100%', maxWidth: '420px', background: 'var(--superficie)',
      border: '1px solid var(--borde)', borderRadius: 'var(--r-xl)',
      padding: 'var(--e-6)', boxShadow: 'var(--sombra-3)'
    },
    marca: { fontSize: '13px', fontWeight: 900, letterSpacing: '3px', color: 'var(--marca)', marginBottom: 'var(--e-5)' },
    titulo: { fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--texto)', marginBottom: 'var(--e-2)' },
    texto: { fontSize: '14px', color: 'var(--texto-2)', lineHeight: 1.55, marginBottom: 'var(--e-5)' },
    etiqueta: { display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: 'var(--texto-2)', marginBottom: 'var(--e-2)' },
    campo: {
      width: '100%', background: 'var(--fondo)', border: '1px solid var(--borde)',
      borderRadius: 'var(--r-md)', color: 'var(--texto)', padding: '12px 14px',
      fontSize: 'var(--t-base)', outline: 'none', minHeight: 'var(--toque)', boxSizing: 'border-box'
    },
    boton: {
      width: '100%', minHeight: 'var(--toque)', background: 'var(--marca)', color: 'var(--marca-contraste)',
      border: 'none', borderRadius: 'var(--r-md)', fontSize: '14px', fontWeight: 700,
      letterSpacing: '1px', cursor: 'pointer', marginTop: 'var(--e-5)'
    },
    aviso: (tono) => ({
      padding: 'var(--e-3)', borderRadius: 'var(--r-md)', fontSize: '13px', lineHeight: 1.5,
      background: tono === 'error' ? 'var(--peligro-suave)' : 'var(--marca-suave)',
      border: `1px solid ${tono === 'error' ? 'var(--peligro)' : 'var(--marca-borde)'}`,
      color: 'var(--texto)', marginBottom: 'var(--e-4)'
    }),
    enlace: {
      display: 'block', textAlign: 'center', marginTop: 'var(--e-4)',
      fontSize: '13px', color: 'var(--texto-2)', background: 'none', border: 'none',
      cursor: 'pointer', width: '100%', fontFamily: 'inherit'
    }
  };

  return (
    <div style={s.marco}>
      <div style={s.tarjeta}>
        <div style={s.marca}>COLLTRASH</div>

        {estado === 'verificando' && (
          <>
            <h1 style={s.titulo}>Comprobando el enlace…</h1>
            <p style={s.texto}>Un momento, por favor.</p>
          </>
        )}

        {estado === 'invalido' && (
          <>
            <h1 style={s.titulo}>Este enlace ya no sirve.</h1>
            <div style={s.aviso('error')}>{mensaje}</div>
            <p style={s.texto}>
              Los enlaces caducan a los 30 minutos y sólo pueden usarse una vez.
              Solicita uno nuevo desde la pantalla de acceso.
            </p>
            <button style={s.boton} onClick={() => navigate('/portal')}>IR AL PORTAL CIUDADANO</button>
            <button style={s.enlace} onClick={() => navigate('/login')}>Acceso de administrador o conductor →</button>
          </>
        )}

        {estado === 'valido' && (
          <>
            <h1 style={s.titulo}>{nombre ? `Hola, ${nombre}.` : 'Nueva contraseña'}</h1>
            <p style={s.texto}>Elige una contraseña nueva para tu cuenta.</p>

            {error && <div style={s.aviso('error')}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <label style={s.etiqueta} htmlFor="clave-nueva">NUEVA CONTRASEÑA</label>
              <input
                id="clave-nueva"
                type={verClave ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={s.campo}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />

              <div style={{ height: 'var(--e-4)' }} />

              <label style={s.etiqueta} htmlFor="clave-confirmar">REPITE LA CONTRASEÑA</label>
              <input
                id="clave-confirmar"
                type={verClave ? 'text' : 'password'}
                value={confirmacion}
                onChange={e => setConfirmacion(e.target.value)}
                style={s.campo}
                placeholder="La misma de arriba"
                autoComplete="new-password"
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'var(--e-3)', fontSize: '13px', color: 'var(--texto-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={verClave} onChange={e => setVerClave(e.target.checked)} />
                Mostrar contraseña
              </label>

              <button type="submit" style={{ ...s.boton, opacity: enviando ? 0.6 : 1 }} disabled={enviando}>
                {enviando ? 'GUARDANDO…' : 'GUARDAR CONTRASEÑA'}
              </button>
            </form>
          </>
        )}

        {estado === 'listo' && (
          <>
            <h1 style={s.titulo}>Contraseña actualizada.</h1>
            <div style={s.aviso('exito')}>{mensaje}</div>
            <button style={s.boton} onClick={() => navigate('/portal')}>ENTRAR AL PORTAL CIUDADANO</button>
            <button style={s.enlace} onClick={() => navigate('/login')}>Soy administrador o conductor →</button>
          </>
        )}
      </div>
    </div>
  );
}
