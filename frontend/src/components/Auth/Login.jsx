import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, solicitarRecuperacion } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './Login.css';

const roles = [
  { key: 'administrador', label: 'ADMINISTRADOR' },
  { key: 'conductor',     label: 'CONDUCTOR'     },
  { key: 'ciudadano',     label: 'CIUDADANO'     },
];

export default function Login() {
  const [rolSeleccionado, setRolSeleccionado] = useState('administrador');
  const [form, setForm] = useState({ email: '', password: '' });
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  // Modo recuperación: reemplaza el formulario mientras se pide el enlace.
  const [recuperando, setRecuperando] = useState(false);
  const [avisoRecuperacion, setAvisoRecuperacion] = useState('');
  const { setUsuario } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = 'var(--bg-global)';
    document.body.style.margin = '0';
    document.body.style.fontFamily = '"Inter", "Geist", sans-serif';
    return () => {
      document.body.style.backgroundColor = prevBg;
    };
  }, []);

  /**
   * Pide el enlace de recuperación.
   *
   * Sirve para los tres roles: el servidor no distingue quién pide, sólo que
   * la cuenta exista y esté activa. La respuesta es la misma en todo caso,
   * para no convertir la pantalla en un detector de cuentas.
   */
  const handleRecuperar = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) return;
    setCargando(true);
    setError('');
    try {
      const res = await solicitarRecuperacion(form.email.trim().toLowerCase());
      setAvisoRecuperacion(res.data.mensaje);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No pudimos procesar la solicitud. Intente de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rolSeleccionado === 'ciudadano') {
      window.location.href = '/portal';
      return;
    }
    setCargando(true);
    setError('');
    try {
      const res = await login(form);
      const usuario = res.data.usuario;

      if (usuario.rol !== rolSeleccionado) {
        setError(`Cuenta inválida para rol ${rolSeleccionado.toUpperCase()}.`);
        localStorage.removeItem('token');
        return;
      }

      localStorage.setItem('token', res.data.token);
      setUsuario(usuario);

      if (usuario.rol === 'conductor') {
        navigate('/conductor');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      // Un fallo de red o un error del servidor no son unas credenciales malas.
      // Mostrarlo todo como "Credenciales incorrectas" escondio durante la
      // prueba desde el movil un rechazo de CORS que nada tenia que ver con la
      // contrasena, y llevo a buscar el problema en la base de datos.
      if (!err.response) {
        setError('No se pudo contactar con el servidor. Revise su conexion e intentelo de nuevo.');
      } else if (err.response.data?.mensaje) {
        setError(err.response.data.mensaje);
      } else if (err.response.status === 401) {
        setError('Credenciales incorrectas.');
      } else {
        setError(`Error del servidor (${err.response.status}). Intentelo de nuevo o avise al administrador.`);
      }
    } finally {
      setCargando(false);
    }
  };

  const esCiudadano = rolSeleccionado === 'ciudadano';

  return (
    <div className="login-wrapper">
      {/* TEXTURA TIPOGRÁFICA DE FONDO */}
      <div className="login-bg-text">
        <div className="login-bg-line">COLL</div>
        <div className="login-bg-line">TRASH</div>
      </div>

      {/* TOPBAR */}
      <div className="login-topbar">
        <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '2px', color: 'var(--texto)' }}>
          COLL<span style={{ color: 'transparent', WebkitTextStroke: '1px var(--texto)' }}>TRASH</span>
        </div>
        <div className="login-topbar-status">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', animation: 'blink 1.5s infinite' }}></div>
          SISTEMA ACTIVO / Neiva, COL
        </div>
      </div>

      {/* VERSIÓN */}
      <div style={{
        position: 'absolute',
        bottom: '40px',
        right: '40px',
        transform: 'rotate(-90deg)',
        transformOrigin: 'right bottom',
        fontSize: '12px',
        color: 'var(--texto)',
        fontWeight: 600,
        letterSpacing: '3px',
        zIndex: 10
      }}>
        GRS — v2.4.1 — 2026
      </div>

      {/* FOOTER */}
      <div style={{
        position: 'absolute',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '12px',
        color: 'var(--texto-2)',
        fontWeight: 600,
        letterSpacing: '1px',
        zIndex: 10
      }}>
        © 2026 COLLTRASH · NEIVA, COLOMBIA
      </div>

      {/* FORMULARIO */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10
      }}>
        <div className="login-form-container">
          
          <div style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '3px', marginBottom: '32px' }}>
            {recuperando ? 'RECUPERAR ACCESO' : 'ACCESO AL SISTEMA'}
          </div>

          {/* Vista de recuperacion: ocupa el sitio del formulario en lugar de
              abrir otra pantalla. El correo ya esta escrito y se arrastra. */}
          {recuperando ? (
            <>
              <button
                type="button"
                onClick={() => { setRecuperando(false); setAvisoRecuperacion(''); setError(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--texto-2)', fontSize: '11px', cursor: 'pointer', marginBottom: '24px', padding: 0, fontFamily: 'inherit', letterSpacing: '1px' }}
              >
                &larr; Volver al acceso
              </button>

              <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--texto)', marginBottom: '8px' }}>
                &iquest;Olvid&oacute; su contrase&ntilde;a?
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--texto-2)', lineHeight: 1.6, marginBottom: '32px' }}>
                Escriba el correo de su cuenta y le enviaremos un enlace para elegir una nueva. Caduca en 30 minutos.
              </p>

              {avisoRecuperacion ? (
                <div style={{ padding: '16px', background: 'var(--marca-suave)', border: '1px solid var(--marca-borde)', borderRadius: '10px', fontSize: '13px', lineHeight: 1.55, color: 'var(--texto)' }}>
                  <i className="bi bi-envelope-check" style={{ marginRight: '8px', color: 'var(--color-primary)' }}></i>
                  {avisoRecuperacion}
                  <div style={{ fontSize: '12px', color: 'var(--texto-2)', marginTop: '10px' }}>
                    Revise tambi&eacute;n la carpeta de correo no deseado.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRecuperar}>
                  {error && (
                    <div style={{ color: 'var(--peligro)', fontSize: '11px', marginBottom: '20px', letterSpacing: '0.5px' }}>{error}</div>
                  )}
                  <div style={{ position: 'relative', marginBottom: '32px' }}>
                    <label style={{ position: 'absolute', top: '-20px', left: 0, fontSize: '12px', color: 'var(--texto-2)', fontWeight: 700, letterSpacing: '2px' }}>CORREO ELECTR&Oacute;NICO</label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder="usuario@colltrash.com"
                      style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid color-mix(in oklch, var(--color-primary), transparent 70%)', color: 'var(--texto)', fontSize: '16px', padding: '10px 0', outline: 'none', caretColor: 'var(--color-primary)' }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={cargando || !form.email.trim()}
                    style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '16px', cursor: cargando ? 'wait' : 'pointer', padding: 0, opacity: (cargando || !form.email.trim()) ? 0.5 : 1 }}
                  >
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--marca-contraste)' }}>
                      <i className="bi bi-arrow-right"></i>
                    </div>
                    <span style={{ fontSize: '13px', color: 'var(--texto)', fontWeight: 800, letterSpacing: '3px' }}>
                      {cargando ? 'ENVIANDO...' : 'ENVIAR ENLACE'}
                    </span>
                  </button>
                </form>
              )}
            </>
          ) : (
          <>

          <div className="login-tabs-container">
            {roles.map(r => (
              <button
                key={r.key}
                className="login-tab-btn"
                onClick={() => { setRolSeleccionado(r.key); setError(''); }}
                style={{
                  color: rolSeleccionado === r.key ? 'var(--texto)' : 'var(--texto-2)',
                  borderBottom: `2px solid ${rolSeleccionado === r.key ? 'var(--color-primary)' : 'transparent'}`
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {error && (
            <div style={{ color: 'var(--peligro)', fontSize: '11px', marginBottom: '20px', letterSpacing: '0.5px' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {esCiudadano ? (
              <div style={{ fontSize: '13px', color: 'var(--texto-2)', lineHeight: 1.6, marginBottom: '20px' }}>
                Accede al Portal Ciudadano para consultar horarios, reportar y hacer seguimiento en vivo.
              </div>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <label style={{ position: 'absolute', top: '-20px', left: 0, fontSize: '12px', color: 'var(--texto-2)', fontWeight: 700, letterSpacing: '2px' }}>CORREO ELECTRÓNICO</label>
                  <input
                    type="email" required
                    value={form.email}
                    onChange={e => setForm({...form, email: e.target.value})}
                    className="transparent-input"
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid color-mix(in oklch, var(--color-primary), transparent 70%)',
                      color: 'var(--texto)',
                      fontSize: '18px',
                      padding: '10px 0',
                      outline: 'none',
                      caretColor: 'var(--color-primary)',
                      transition: 'border-color 0.3s'
                    }}
                    onFocus={e => e.target.style.borderBottom = '1px solid var(--color-primary)'}
                    onBlur={e => e.target.style.borderBottom = '1px solid color-mix(in oklch, var(--color-primary), transparent 70%)'}
                    placeholder="usuario@colltrash.com"
                  />
                </div>

                <div style={{ position: 'relative', marginTop: '10px' }}>
                  <label style={{ position: 'absolute', top: '-20px', left: 0, fontSize: '12px', color: 'var(--texto-2)', fontWeight: 700, letterSpacing: '2px' }}>CONTRASEÑA</label>
                  <input
                    type={mostrarPassword ? 'text' : 'password'} required
                    value={form.password}
                    onChange={e => setForm({...form, password: e.target.value})}
                    className="transparent-input"
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid color-mix(in oklch, var(--color-primary), transparent 70%)',
                      color: 'var(--texto)',
                      fontSize: '18px',
                      padding: '10px 36px 10px 0',
                      outline: 'none',
                      caretColor: 'var(--color-primary)',
                      transition: 'border-color 0.3s'
                    }}
                    onFocus={e => e.target.style.borderBottom = '1px solid var(--color-primary)'}
                    onBlur={e => e.target.style.borderBottom = '1px solid color-mix(in oklch, var(--color-primary), transparent 70%)'}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPassword(!mostrarPassword)}
                    aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    style={{ position: 'absolute', right: 0, bottom: '2px', background: 'none', border: 'none', color: 'var(--texto-2)', cursor: 'pointer', minWidth: '44px', minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', padding: 0 }}
                  >
                    <i className={`bi ${mostrarPassword ? 'bi-eye-slash' : 'bi-eye'}`} style={{ fontSize: '16px' }}></i>
                  </button>
                  {/* Antes era un <div> sin accion. */}
                  <button
                    type="button"
                    onClick={() => { setRecuperando(true); setError(''); setAvisoRecuperacion(''); }}
                    style={{ position: 'absolute', right: 0, top: '-20px', fontSize: '12px', color: 'var(--texto-2)', cursor: 'pointer', letterSpacing: '1px', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                  >
                    ¿Olvidaste?
                  </button>
                </div>
              </>
            )}

            <div style={{ marginTop: '20px' }}>
              <button 
                type="submit" 
                disabled={cargando}
                style={{
                  background: 'none',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  cursor: cargando ? 'wait' : 'pointer',
                  padding: 0
                }}
              >
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--marca-contraste)',
                  fontSize: '20px',
                  transition: 'transform 0.2s',
                  transform: cargando ? 'scale(0.9)' : 'scale(1)'
                }}>
                  {cargando ? <i className="bi bi-arrow-repeat" style={{ animation: 'spin 1s linear infinite' }}></i> : <i className="bi bi-arrow-right"></i>}
                </div>
                <span style={{ fontSize: '15px', color: 'var(--texto)', fontWeight: 800, letterSpacing: '4px' }}>
                  {cargando ? 'VERIFICANDO...' : 'INGRESAR'}
                </span>
              </button>
            </div>
          </form>
          </>
          )}

        </div>
      </div>
      
      <style>{`
        @keyframes blink {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        input::placeholder {
          color: var(--texto-3);
        }
      `}</style>
    </div>
  );
}
