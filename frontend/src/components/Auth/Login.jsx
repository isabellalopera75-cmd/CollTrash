import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../services/api';
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
      setError(err.response?.data?.mensaje || 'Credenciales incorrectas.');
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
        <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '2px', color: '#fff' }}>
          COLL<span style={{ color: 'transparent', WebkitTextStroke: '1px #fff' }}>TRASH</span>
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
        fontSize: '10px',
        color: '#222',
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
        fontSize: '10px',
        color: '#333',
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
            ACCESO AL SISTEMA
          </div>

          <div className="login-tabs-container">
            {roles.map(r => (
              <button
                key={r.key}
                className="login-tab-btn"
                onClick={() => { setRolSeleccionado(r.key); setError(''); }}
                style={{
                  color: rolSeleccionado === r.key ? '#fff' : '#555',
                  borderBottom: `2px solid ${rolSeleccionado === r.key ? 'var(--color-primary)' : 'transparent'}`
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {error && (
            <div style={{ color: '#ef4444', fontSize: '11px', marginBottom: '20px', letterSpacing: '0.5px' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {esCiudadano ? (
              <div style={{ fontSize: '13px', color: '#666', lineHeight: 1.6, marginBottom: '20px' }}>
                Accede al Portal Ciudadano para consultar horarios, reportar y hacer seguimiento en vivo.
              </div>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <label style={{ position: 'absolute', top: '-20px', left: 0, fontSize: '10px', color: '#666', fontWeight: 700, letterSpacing: '2px' }}>CORREO ELECTRÓNICO</label>
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
                      color: '#fff',
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
                  <label style={{ position: 'absolute', top: '-20px', left: 0, fontSize: '10px', color: '#666', fontWeight: 700, letterSpacing: '2px' }}>CONTRASEÑA</label>
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
                      color: '#fff',
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
                    style={{ position: 'absolute', right: 0, bottom: '12px', background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 0 }}
                  >
                    <i className={`bi ${mostrarPassword ? 'bi-eye-slash' : 'bi-eye'}`} style={{ fontSize: '16px' }}></i>
                  </button>
                  <div style={{ position: 'absolute', right: 0, top: '-20px', fontSize: '10px', color: '#666', cursor: 'pointer', letterSpacing: '1px' }}>¿Olvidaste?</div>
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
                  color: '#000',
                  fontSize: '20px',
                  transition: 'transform 0.2s',
                  transform: cargando ? 'scale(0.9)' : 'scale(1)'
                }}>
                  {cargando ? <i className="bi bi-arrow-repeat" style={{ animation: 'spin 1s linear infinite' }}></i> : <i className="bi bi-arrow-right"></i>}
                </div>
                <span style={{ fontSize: '15px', color: '#fff', fontWeight: 800, letterSpacing: '4px' }}>
                  {cargando ? 'VERIFICANDO...' : 'INGRESAR'}
                </span>
              </button>
            </div>
          </form>

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
          color: rgba(255, 255, 255, 0.2);
        }
        /* Fix Chrome autofill background */
        .transparent-input:-webkit-autofill,
        .transparent-input:-webkit-autofill:hover, 
        .transparent-input:-webkit-autofill:focus, 
        .transparent-input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 30px var(--bg-global) inset !important;
            -webkit-text-fill-color: white !important;
            transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  );
}
