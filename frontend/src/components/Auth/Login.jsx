import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const roles = [
  { key: 'administrador', label: 'Administrador', icon: 'bi-shield-fill-check', desc: 'Gestión de rutas y operaciones' },
  { key: 'conductor',     label: 'Conductor',      icon: 'bi-truck-front-fill',   desc: 'Ver mi ruta asignada'          },
  { key: 'ciudadano',     label: 'Ciudadano',       icon: 'bi-person-circle',      desc: 'Reportar y consultar servicios' },
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
    document.body.style.backgroundColor = '#0D1017';
    return () => {
      document.body.style.backgroundColor = prevBg;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rolSeleccionado === 'ciudadano') {
      window.location.href = 'http://localhost:3000/api/auth/google';
      return;
    }
    setCargando(true);
    setError('');
    try {
      const res = await login(form);
      const usuario = res.data.usuario;

      // Validar que el rol coincida con la pestaña seleccionada
      if (usuario.rol !== rolSeleccionado) {
        setError(`Esta cuenta no es de tipo "${roles.find(r => r.key === rolSeleccionado)?.label}". Selecciona el rol correcto.`);
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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-global)',
      padding: '20px',
      paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))',
      paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
      boxSizing: 'border-box',
      backgroundImage: 'radial-gradient(ellipse at 50% 0%, color-mix(in oklch, var(--color-primary), transparent 92%) 0%, transparent 60%)',
    }}>
      <div style={{ width: '100%', maxWidth: '460px' }}>

        {/* Logo & título */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '16px',
            background: 'color-mix(in oklch, var(--color-primary), transparent 85%)',
            border: '1px solid color-mix(in oklch, var(--color-primary), transparent 60%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '28px', color: 'var(--color-primary)'
          }}>
            <i className="bi bi-truck-front-fill"></i>
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
            Coll<span style={{ color: 'var(--color-primary)' }}>Trash</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Gestión de recolección · Neiva, Colombia
          </p>
        </div>

        {/* Card principal */}
        <div className="card" style={{ padding: '28px', border: '1px solid var(--border-color)' }}>

          {/* Selector de rol */}
          <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '12px' }}>
            ACCEDER COMO
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
            {roles.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => { setRolSeleccionado(r.key); setError(''); }}
                style={{
                  padding: '12px 8px',
                  borderRadius: '10px',
                  border: `1px solid ${rolSeleccionado === r.key ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  background: rolSeleccionado === r.key
                    ? 'color-mix(in oklch, var(--color-primary), transparent 88%)'
                    : 'var(--bg-secondary)',
                  color: rolSeleccionado === r.key ? 'var(--color-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <i className={`bi ${r.icon}`} style={{ fontSize: '20px' }}></i>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{r.label}</span>
              </button>
            ))}
          </div>

          {/* Descripción del rol */}
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '24px' }}>
            {roles.find(r => r.key === rolSeleccionado)?.desc}
          </p>

          {/* Error */}
          {error && (
            <div className="status-badge status-danger" style={{ width: '100%', justifyContent: 'center', marginBottom: '16px', padding: '10px 14px', borderRadius: '8px' }}>
              <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: '6px' }}></i>
              {error}
            </div>
          )}

          {/* Formulario o botón Portal Ciudadano */}
          {esCiudadano ? (
            <div style={{ display: 'grid', gap: '12px' }}>
              <button
                type="button"
                onClick={() => window.location.href = '/portal'}
                className="btn btn-primary"
                style={{ width: '100%', padding: '16px', gap: '12px', fontWeight: 700, fontSize: '15px', justifyContent: 'center', borderRadius: '12px' }}
              >
                <i className="bi bi-person-check-fill" style={{ fontSize: '20px' }}></i>
                Ingresar al Portal Ciudadano
              </button>
              <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Accede para consultar los horarios de tu barrio, realizar reportes ciudadanos y recibir seguimiento en vivo.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Correo electrónico
                </label>
                <input
                  type="email" required
                  className="card"
                  style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'white', padding: '12px', borderRadius: '8px' }}
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  placeholder="usuario@colltrash.co"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Contraseña
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={mostrarPassword ? 'text' : 'password'} required
                    className="card"
                    style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'white', padding: '12px 44px 12px 12px', borderRadius: '8px' }}
                    value={form.password}
                    onChange={e => setForm({...form, password: e.target.value})}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPassword(!mostrarPassword)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}
                  >
                    <i className={`bi ${mostrarPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                  </button>
                </div>
                <p style={{ textAlign: 'right', fontSize: '11px', color: 'var(--color-primary)', marginTop: '6px', cursor: 'pointer' }}>¿Olvidaste tu contraseña?</p>
              </div>
              <button type="submit" className="btn btn-primary" style={{ padding: '14px', fontWeight: 700, marginTop: '4px', fontSize: '14px' }} disabled={cargando}>
                {cargando ? (
                  <><i className="bi bi-arrow-repeat" style={{ marginRight: '8px', animation: 'spin 1s linear infinite' }}></i>Verificando...</>
                ) : 'Ingresar'}
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '20px' }}>
          © 2026 CollTrash · Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}