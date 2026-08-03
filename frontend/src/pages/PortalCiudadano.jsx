import React, { useState, useEffect } from 'react';
import './PortalCiudadano.css';
import {
  Calendar, Clock, Truck, Bell, LogOut, MessageSquareWarning,
  CheckCircle2, ChevronRight, Home, MapPin, Camera, Send,
  XCircle, Info, Recycle, Leaf, Flame, Navigation, User,
  X, ImagePlus, LocateFixed, Loader2
} from 'lucide-react';
import io from 'socket.io-client';
import { crearReporteCiudadano, obtenerMisReportes, obtenerBarrios, verificarCorreo, login, registrarCiudadano } from '../services/api';

const barriosPorZona = {
  "centro": {
    nombre: "Barrio Centro",
    sector: "Sector A — Zona 1",
    horarios: [
      { id: 1, dia: "Hoy",    hora: "07:00–09:00", tipo: "Ordinarios", activo: true  },
      { id: 2, dia: "Mañana", hora: "06:30–08:30", tipo: "Reciclaje",  activo: false },
      { id: 3, dia: "Jue",    hora: "07:00–09:00", tipo: "Ordinarios", activo: false },
      { id: 4, dia: "Sáb",    hora: "08:00–10:00", tipo: "Ordinarios", activo: false },
    ],
    diasCalendario: [1, 4, 8, 11, 15, 18, 22, 25, 29],
    diasReciclaje:  [4, 18],
  },
  "norte": {
    nombre: "Barrio Norte",
    sector: "Sector C — Zona 2",
    horarios: [
      { id: 1, dia: "Hoy",    hora: "14:00–16:00", tipo: "Ordinarios", activo: true  },
      { id: 2, dia: "Mié",    hora: "14:00–16:00", tipo: "Reciclaje",  activo: false },
    ],
    diasCalendario: [2, 5, 9, 12, 16, 19, 23, 26, 30],
    diasReciclaje:  [5, 19],
  },
  "sur": {
    nombre: "Barrio Sur",
    sector: "Sector B — Zona 3",
    horarios: [
      { id: 1, dia: "Hoy",    hora: "10:00–12:00", tipo: "Ordinarios", activo: true  },
      { id: 2, dia: "Jue",    hora: "10:00–12:00", tipo: "Reciclaje",  activo: false },
    ],
    diasCalendario: [3, 6, 10, 13, 17, 20, 24, 27],
    diasReciclaje:  [6, 20],
  },
};

const tiposReporte = [
  "No pasó el camión en el horario",
  "Contenedor lleno o desbordado",
  "Residuos no recogidos",
  "Mal manejo de residuos",
  "Vehículo en mal estado",
  "Otro"
];

export default function PortalCiudadano() {
  const [onboarding, setOnboarding] = useState("auth");
  const [zona, setZona] = useState("centro");
  const [barrioReal, setBarrioReal] = useState("Barrio Centro");
  const [tab, setTab] = useState("inicio");
  const [misReportes, setMisReportes] = useState([]);

  useEffect(() => {
    // Set body background to match citizen app background for status bar blending
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#080c0a';

    const localZona = localStorage.getItem('pc_zona');
    const localBarrio = localStorage.getItem('pc_barrio');
    const token = localStorage.getItem('token');
    
    if (localZona && token) {
      setZona(localZona);
      if (localBarrio) setBarrioReal(localBarrio);
      setOnboarding("done");
      cargarMisReportes();
    } else {
      // Si no hay token, mostrar pantalla de login ("auth" es el nombre del estado inicial)
      setOnboarding("auth");
      localStorage.removeItem('token');
    }

    return () => {
      document.body.style.backgroundColor = prevBg;
    };
  }, []);

  useEffect(() => {
    const socketUrl = window.location.hostname === 'localhost' && window.location.port !== '3000' ? 'http://localhost:3000' : window.location.origin;
    const token = localStorage.getItem('token');
    const socket = io(socketUrl, {
      auth: { token }
    });

    socket.on('connect', () => {
      console.log('🔌 Socket conectado en PortalCiudadano');
    });

    socket.on('reporte_actualizado', (updatedReport) => {
      // Re-fetch all reports for this citizen since we don't have local IDs anymore
      cargarMisReportes();
    });

    return () => socket.disconnect();
  }, []);

  const cargarMisReportes = async () => {
    try {
      const res = await obtenerMisReportes();
      setMisReportes(res.data.reportes);
    } catch (error) {
      console.error('Error al cargar mis reportes:', error);
      setMisReportes([]);
    }
  };

  const handleFinishOnboarding = (z, bNombre) => {
    setZona(z);
    setBarrioReal(bNombre);
    localStorage.setItem('pc_zona', z);
    localStorage.setItem('pc_barrio', bNombre);
    setOnboarding("done");
    cargarMisReportes();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('pc_zona');
    localStorage.removeItem('pc_barrio');
    localStorage.removeItem('pc_user_email');
    localStorage.removeItem('pc_user_nombre');
    setOnboarding("auth");
    setTab("inicio");
  };

  const agregarReporte = (nuevoReporte) => {
    cargarMisReportes();
    setTab("mis-reportes");
  };

  if (onboarding !== "done") {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#080c0a',
        color: '#f0f0e8',
        fontFamily: '"Inter", "Geist", sans-serif',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* TOPBAR UNIFICADA */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '24px 40px',
          borderBottom: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: '#5a5f5c' }}>
            COLLTRASH // PORTAL CIUDADANO
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', fontWeight: 700, color: '#4a7c59', letterSpacing: '1px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#4a7c59', animation: 'blink 1.5s infinite' }}></div>
            EN LÍNEA
          </div>
        </div>

        {/* CONTENEDOR 2 COLUMNAS */}
        <div className="pc-onboarding-grid">
          {/* PANEL IZQUIERDO */}
          <div className="pc-left-panel">
            <div className="pc-left-content">
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#4a7c59', letterSpacing: '3px', marginBottom: '40px' }}>
                GESTIÓN DE RESIDUOS · NEIVA, COL.
              </div>
              <div style={{ lineHeight: 0.85, marginBottom: '24px' }}>
                <div className="pc-hero-text" style={{ fontWeight: 900, color: '#fff', letterSpacing: '-0.05em' }}>COLL</div>
                <div className="pc-hero-text" style={{ fontWeight: 900, color: 'transparent', WebkitTextStroke: '2px #fff', letterSpacing: '-0.05em' }}>TRASH</div>
              </div>
              <div className="pc-divider-line" style={{ width: '40px', height: '1px', backgroundColor: '#4a7c59', marginBottom: '24px' }}></div>
              <p style={{ color: '#5a5f5c', fontSize: '13px', maxWidth: '320px', lineHeight: 1.5, marginBottom: '40px' }}>
                Plataforma ciudadana para reportar incidentes y consultar el servicio de recolección.
              </p>
              <div className="pc-features-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[
                  "Reportar basureros clandestinos",
                  "Consultar horario de recolección",
                  "Reportar fallos en vehículos",
                  "Reportar mala atención",
                  "Consejos de reciclaje",
                  "Seguimiento de tus reportes"
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#5a5f5c', fontSize: '12px', fontWeight: 500 }}>
                    <div style={{ width: '16px', height: '1px', backgroundColor: '#4a7c59' }}></div>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            
            {/* FOOTER IZQUIERDO */}
            <div className="pc-left-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', color: '#2a2f2c', fontSize: '10px', fontWeight: 700, letterSpacing: '2px' }}>
              <div>EST. 2024</div>
              <div>V 2.0</div>
            </div>
          </div>

          {/* PANEL DERECHO */}
          <div className="pc-right-panel">
            <div style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
              {onboarding === "auth" && <OnboardingAuth onNext={() => setOnboarding("ubicacion")} />}
              {onboarding === "ubicacion" && <OnboardingUbicacion onNext={() => setOnboarding("confirmacion")} onManual={() => setOnboarding("manual")} setZona={(z) => {setZona(z); setBarrioReal("Barrio Centro");}} />}
              {onboarding === "manual" && <OnboardingManual onNext={() => setOnboarding("confirmacion")} setZona={setZona} setBarrioReal={setBarrioReal} onBack={() => setOnboarding("ubicacion")} />}
              {onboarding === "confirmacion" && <OnboardingConfirmacion zona={zona} barrioReal={barrioReal} onFinish={() => handleFinishOnboarding(zona, barrioReal)} />}
            </div>
            {/* ETIQUETA VERTICAL GRS */}
            <div style={{
              position: 'absolute', bottom: '40px', right: '10px', transform: 'rotate(-90deg)', transformOrigin: 'right bottom',
              fontSize: '10px', color: '#2a2f2c', fontWeight: 700, letterSpacing: '3px'
            }}>
              GRS — V2.4.1 — 2026
            </div>
          </div>
        </div>
      </div>
    );
  }

  const barrio = barriosPorZona[zona];
  const userName = localStorage.getItem("pc_user_nombre") || "Ciudadano";

  return (
    <div className="pc-wrapper">
      <div className="pc-container">
        <div style={{ padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px 16px 16px', borderBottom: '1px solid var(--pc-border)', backgroundColor: 'var(--pc-bg-background)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(74, 124, 89, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a7c59' }}>
              <Home size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Hola, {userName}</div>
              <div style={{ fontSize: '12px', color: '#8C95A6' }}>{barrioReal} · Neiva</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <Bell size={20} color="#8C95A6" style={{ cursor: 'pointer' }} />
            <LogOut size={20} color="#8C95A6" style={{ cursor: 'pointer' }} onClick={handleLogout} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {tab === "inicio" && <TabInicio barrio={barrio} onChangeTab={setTab} />}
        {tab === "horarios" && <TabHorarios barrio={barrio} />}
        {tab === "reportar" && <TabReportar onEnviado={agregarReporte} barrioReal={barrioReal} />}
        {tab === "mis-reportes" && <TabMisReportes reportes={misReportes} />}
      </div>

      <div className="pc-bottom-nav">
        <NavItem active={tab === "inicio"} icon={<Home size={20} />} label="Inicio" onClick={() => setTab("inicio")} />
        <NavItem active={tab === "horarios"} icon={<Calendar size={20} />} label="Horarios" onClick={() => setTab("horarios")} />
        <NavItem active={tab === "reportar"} icon={<MessageSquareWarning size={20} />} label="Reportar" onClick={() => setTab("reportar")} />
        <NavItem active={tab === "mis-reportes"} icon={<CheckCircle2 size={20} />} label="Mis reportes" onClick={() => setTab("mis-reportes")} />
      </div>
      </div>
    </div>
  );
}

function NavItem({ active, icon, label, onClick }) {
  return (
    <div className={`pc-nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {React.cloneElement(icon, { strokeWidth: active ? 2.5 : 1.75 })}
      <span>{label}</span>
    </div>
  );
}

// ── ONBOARDING COMPONENTS ───────────────────────────────────────

function OnboardingAuth({ onNext }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [tabMode, setTabMode] = useState("register"); // "register" or "login"
  const [errorMsg, setErrorMsg] = useState("");

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setErrorMsg("");

    const emailNorm = email.trim().toLowerCase();

    try {
      if (tabMode === "login") {
        // ── INICIAR SESIÓN ──────────────────────────────────────────
        // Solo intenta autenticar. El backend ya sabe si es ciudadano o no.
        try {
          const res = await login({ email: emailNorm, password: password.trim() });
          if (res.data.usuario.rol !== 'ciudadano') {
            setErrorMsg('Esta cuenta no pertenece a un ciudadano. Usa el acceso de administrador o conductor.');
            return;
          }
          localStorage.setItem('token', res.data.token);
          localStorage.setItem("pc_user_email", res.data.usuario.email);
          localStorage.setItem("pc_user_nombre", res.data.usuario.nombre);
          onNext();
        } catch (err) {
          const status = err.response?.status;
          if (status === 401) {
            // El email no existe en ciudadanos → sugerir registrarse
            setErrorMsg('Correo o contraseña incorrectos. Si aún no tienes cuenta, regístrate.');
          } else {
            setErrorMsg(err.response?.data?.mensaje || 'Error al iniciar sesión.');
          }
        }

      } else {
        // ── REGISTRARSE ─────────────────────────────────────────────
        // 1. Si el correo pertenece a un admin/conductor → inválido aquí
        try {
          const checkRes = await verificarCorreo(emailNorm);
          if (checkRes.data.existe) {
            setErrorMsg('Este correo no puede usarse para el portal ciudadano.');
            return;
          }
        } catch { /* si falla la verificación, continuar igualmente */ }

        // 2. Intentar registrar. El backend rechaza duplicados en ciudadanos.
        const nom = nombre.trim() || emailNorm.split("@")[0];
        const nomCapitalizado = nom.charAt(0).toUpperCase() + nom.slice(1);
        try {
          const res = await registrarCiudadano({
            nombre: nomCapitalizado,
            email: emailNorm,
            password: password.trim()
          });
          localStorage.setItem('token', res.data.token);
          localStorage.setItem("pc_user_email", res.data.usuario.email);
          localStorage.setItem("pc_user_nombre", res.data.usuario.nombre);
          onNext();
        } catch (err) {
          const mensaje = err.response?.data?.mensaje || '';
          if (mensaje.toLowerCase().includes('ya está registrado como ciudadano') || mensaje.toLowerCase().includes('ya está registrado')) {
            setTabMode('login');
            setErrorMsg('Ya tienes una cuenta con este correo. Inicia sesión.');
          } else {
            setErrorMsg(mensaje || 'Error al registrar.');
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
      <div style={{ width: '100%' }}>
        
        {/* Toggle between Register and Login */}
        <div style={{ display: 'flex', gap: '20px', marginBottom: '40px' }}>
          <button 
            type="button" 
            style={{
              background: 'none', border: 'none', padding: '0 0 6px 0',
              color: tabMode === 'login' ? '#fff' : '#5a5f5c',
              fontSize: '10px', fontWeight: 700, letterSpacing: '2px',
              cursor: 'pointer',
              borderBottom: `2px solid ${tabMode === 'login' ? '#4a7c59' : 'transparent'}`,
              transition: 'all 0.3s'
            }}
            onClick={() => { setTabMode('login'); setErrorMsg(''); }}
          >
            INICIAR SESIÓN
          </button>
          <button 
            type="button" 
            style={{
              background: 'none', border: 'none', padding: '0 0 6px 0',
              color: tabMode === 'register' ? '#fff' : '#5a5f5c',
              fontSize: '10px', fontWeight: 700, letterSpacing: '2px',
              cursor: 'pointer',
              borderBottom: `2px solid ${tabMode === 'register' ? '#4a7c59' : 'transparent'}`,
              transition: 'all 0.3s'
            }}
            onClick={() => { setTabMode('register'); setErrorMsg(''); }}
          >
            REGISTRARSE
          </button>
        </div>

        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '-1px', color: '#fff', marginBottom: '8px' }}>
            {tabMode === 'register' ? 'Crea tu cuenta.' : 'Bienvenido de vuelta.'}
          </h1>
          <p style={{ fontSize: '13px', color: '#5a5f5c' }}>
            {tabMode === 'register' ? 'Regístrate para reportar incidentes de recolección en tu sector.' : 'Accede para reportar incidentes y consultar el estado de tus solicitudes.'}
          </p>
        </div>

        <form onSubmit={handleEmailSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {tabMode === "register" && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
              <div style={{ position: 'relative' }}>
                <label style={{ position: 'absolute', top: '-18px', left: 0, fontSize: '10px', color: '#5a5f5c', fontWeight: 700, letterSpacing: '2px' }}>NOMBRE COMPLETO</label>
                <input 
                  type="text" 
                  className="transparent-input" 
                  placeholder="Ana García López" 
                  value={nombre} 
                  onChange={e => setNombre(e.target.value)} 
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    borderBottom: '1px solid #4a7c59',
                    color: '#fff', fontSize: '15px', padding: '8px 0', outline: 'none',
                    caretColor: '#4a7c59', transition: 'border-color 0.3s'
                  }}
                  onFocus={e => e.target.style.borderBottom = '1px solid #3d9e5a'}
                  onBlur={e => e.target.style.borderBottom = '1px solid #4a7c59'}
                />
              </div>
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <label style={{ position: 'absolute', top: '-18px', left: 0, fontSize: '10px', color: '#5a5f5c', fontWeight: 700, letterSpacing: '2px' }}>CORREO ELECTRÓNICO</label>
            <input 
              type="email" required 
              className="transparent-input" 
              placeholder="ciudadano@correo.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              style={{
                width: '100%', background: 'transparent', border: 'none',
                borderBottom: '1px solid #4a7c59',
                color: '#fff', fontSize: '15px', padding: '8px 0', outline: 'none',
                caretColor: '#4a7c59', transition: 'border-color 0.3s'
              }}
              onFocus={e => e.target.style.borderBottom = '1px solid #3d9e5a'}
              onBlur={e => e.target.style.borderBottom = '1px solid #4a7c59'}
            />
          </div>

          {tabMode === "register" ? (
            <div style={{ position: 'relative' }}>
              <label style={{ position: 'absolute', top: '-18px', left: 0, fontSize: '10px', color: '#5a5f5c', fontWeight: 700, letterSpacing: '2px' }}>CONTRASEÑA</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="transparent-input" placeholder="••••••••" style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #4a7c59', color: '#fff', fontSize: '15px', padding: '8px 30px 8px 0', outline: 'none', caretColor: '#4a7c59', transition: 'border-color 0.3s' }} onFocus={e => e.target.style.borderBottom = '1px solid #3d9e5a'} onBlur={e => e.target.style.borderBottom = '1px solid #4a7c59'} />
              <i className="bi bi-eye" style={{ position: 'absolute', right: 0, bottom: '8px', color: '#5a5f5c' }}></i>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <label style={{ position: 'absolute', top: '-18px', left: 0, fontSize: '10px', color: '#5a5f5c', fontWeight: 700, letterSpacing: '2px' }}>CONTRASEÑA</label>
              <input 
                type="password" required 
                className="transparent-input" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  borderBottom: '1px solid #4a7c59',
                  color: '#fff', fontSize: '15px', padding: '8px 30px 8px 0', outline: 'none',
                  caretColor: '#4a7c59', transition: 'border-color 0.3s'
                }}
                onFocus={e => e.target.style.borderBottom = '1px solid #3d9e5a'}
                onBlur={e => e.target.style.borderBottom = '1px solid #4a7c59'}
              />
              <i className="bi bi-eye" style={{ position: 'absolute', right: 0, bottom: '8px', color: '#5a5f5c', cursor: 'pointer' }}></i>
              <div style={{ position: 'absolute', right: 0, top: '-18px', fontSize: '10px', color: '#5a5f5c', cursor: 'pointer' }}>¿Olvidaste?</div>
            </div>
          )}

          {errorMsg && (
            <div style={{ color: '#ef4444', fontSize: '12px', letterSpacing: '0.5px' }}>
              {errorMsg}
            </div>
          )}

          <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button 
              type="submit" 
              disabled={loading || !email.trim() || !password.trim()}
              style={{
                background: 'none', border: 'none', display: 'flex', alignItems: 'center',
                gap: '16px', cursor: (loading || !email.trim() || !password.trim()) ? 'not-allowed' : 'pointer', padding: 0,
                opacity: (loading || !email.trim() || !password.trim()) ? 0.5 : 1
              }}
            >
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%', background: '#4a7c59',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '18px',
                transition: 'transform 0.2s', transform: loading ? 'scale(0.9)' : 'scale(1)'
              }}>
                {loading ? <Loader2 className="animate-spin-custom" size={20} /> : <i className="bi bi-arrow-right"></i>}
              </div>
              <span style={{ fontSize: '13px', color: '#fff', fontWeight: 800, letterSpacing: '3px' }}>
                {tabMode === "register" ? "CREAR CUENTA" : "INGRESAR"}
              </span>
            </button>
            
            <div 
              style={{ fontSize: '11px', color: '#5a5f5c', cursor: 'pointer' }}
              onClick={() => setTabMode(tabMode === 'register' ? 'login' : 'register')}
            >
              {tabMode === "register" ? "Ya tengo cuenta →" : "No tengo cuenta →"}
            </div>
          </div>
        </form>

        <p style={{ fontSize: '11px', color: '#8C95A6', marginTop: '24px', textAlign: 'center' }}>
          Tus reportes quedarán vinculados de forma segura a esta cuenta.
        </p>
      </div>
    );
}

function OnboardingUbicacion({ onNext, onManual, setZona }) {
  const [loading, setLoading] = useState(false);
  const handleDetect = () => {
    setLoading(true);
    setTimeout(() => {
      setZona("centro");
      onNext();
    }, 2000);
  };
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '40px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: 'transparent', border: '1px solid #4a7c59', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a7c59', marginBottom: '24px' }}>
          <Navigation size={20} strokeWidth={2} style={{ transform: 'rotate(45deg) translate(-2px, 2px)' }} />
        </div>
        
        <h1 style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '-1px', color: '#fff', marginBottom: '8px' }}>
          Permite tu ubicación.
        </h1>
        <p style={{ fontSize: '13px', color: '#5a5f5c' }}>
          Necesitamos tu ubicación para mostrarte los horarios y rutas de tu zona.
        </p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}>
        {[
          { i: <Clock size={14}/>, t: "Horarios exactos de tu barrio" },
          { i: <Bell size={14}/>, t: "Notificaciones previas" },
          { i: <LocateFixed size={14}/>, t: "Seguimiento en tiempo real" }
        ].map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#5a5f5c', fontSize: '12px', fontWeight: 500 }}>
             <div style={{ color: '#4a7c59' }}>{item.i}</div>
             {item.t}
          </div>
        ))}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px' }}>
        <button 
          onClick={handleDetect} 
          disabled={loading}
          style={{
            background: 'none', border: 'none', display: 'flex', alignItems: 'center',
            gap: '16px', cursor: loading ? 'not-allowed' : 'pointer', padding: 0,
            opacity: loading ? 0.5 : 1
          }}
        >
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%', background: '#4a7c59',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '18px',
            transition: 'transform 0.2s', transform: loading ? 'scale(0.9)' : 'scale(1)'
          }}>
            {loading ? <Loader2 className="animate-spin-custom" size={20} /> : <i className="bi bi-arrow-right"></i>}
          </div>
          <span style={{ fontSize: '13px', color: '#fff', fontWeight: 800, letterSpacing: '3px' }}>
             {loading ? 'DETECTANDO...' : 'PERMITIR'}
          </span>
        </button>
        
        <div 
          onClick={onManual} 
          style={{ fontSize: '11px', color: '#5a5f5c', cursor: 'pointer' }}
        >
          Ingresar manual →
        </div>
      </div>
    </div>
  );
}

function OnboardingManual({ onNext, onBack, setZona, setBarrioReal }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [barriosDb, setBarriosDb] = useState([]);

  useEffect(() => {
    const fetchB = async () => {
      try {
        const res = await obtenerBarrios();
        setBarriosDb(res.data.barrios || []);
      } catch (error) {
        console.error("Error al cargar barrios:", error);
      }
    };
    fetchB();
  }, []);

  const handleConfirm = () => {
    if (selected) {
      const zonasArr = ["centro", "norte", "sur"];
      const z = zonasArr[selected.id % 3];
      setZona(z);
      setBarrioReal(selected.nombre);
      onNext();
    }
  };
  
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '40px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#5a5f5c', fontSize: '11px', cursor: 'pointer', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}>
          ← Volver
        </button>
        <h1 style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '-1px', color: '#fff', marginBottom: '8px' }}>
          Elige tu barrio.
        </h1>
        <p style={{ fontSize: '13px', color: '#5a5f5c' }}>
          Busca tu zona para asignarte los horarios.
        </p>
      </div>
      
      <div style={{ position: 'relative', marginBottom: '40px' }}>
        <label style={{ position: 'absolute', top: '-18px', left: 0, fontSize: '10px', color: '#5a5f5c', fontWeight: 700, letterSpacing: '2px' }}>BUSCAR BARRIO</label>
        <MapPin size={16} style={{ position: 'absolute', left: 0, bottom: '10px', color: '#4a7c59' }} />
        <select 
          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #4a7c59', color: selected ? '#fff' : '#5a5f5c', fontSize: '15px', padding: '8px 0 8px 24px', outline: 'none', cursor: 'pointer', transition: 'border-color 0.3s', appearance: 'none' }}
          value={selected?.id || ""} 
          onChange={(e) => {
            const bId = parseInt(e.target.value);
            const b = barriosDb.find(barrio => barrio.id === bId);
            setSelected(b || null);
          }}
          onFocus={e => e.target.style.borderBottom = '1px solid #3d9e5a'} 
          onBlur={e => e.target.style.borderBottom = '1px solid #4a7c59'} 
        >
          <option value="" disabled style={{ backgroundColor: '#080c0a' }}>Selecciona un barrio...</option>
          {barriosDb.map((b) => {
            if (query && !b.nombre.toLowerCase().includes(query.toLowerCase())) return null;
            return (
              <option key={b.id} value={b.id} style={{ backgroundColor: '#080c0a', color: '#fff' }}>
                {b.nombre} - Neiva
              </option>
            );
          })}
        </select>
        <div style={{ position: 'absolute', right: 0, bottom: '10px', color: '#4a7c59', pointerEvents: 'none' }}>▼</div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        <button 
          disabled={!selected} 
          onClick={handleConfirm}
          style={{
            background: 'none', border: 'none', display: 'flex', alignItems: 'center',
            gap: '16px', cursor: !selected ? 'not-allowed' : 'pointer', padding: 0,
            opacity: !selected ? 0.5 : 1
          }}
        >
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%', background: '#4a7c59',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '18px',
            transition: 'transform 0.2s'
          }}>
            <i className="bi bi-arrow-right"></i>
          </div>
          <span style={{ fontSize: '13px', color: '#fff', fontWeight: 800, letterSpacing: '3px' }}>
            CONFIRMAR BARRIO
          </span>
        </button>
      </div>
    </div>
  );
}

function OnboardingConfirmacion({ zona, barrioReal, onFinish }) {
  const barrio = barriosPorZona[zona];
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '40px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: 'transparent', border: '1px solid #4a7c59', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a7c59', marginBottom: '24px' }}>
          <CheckCircle2 size={20} strokeWidth={2} />
        </div>
        
        <h1 style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '-1px', color: '#fff', marginBottom: '8px' }}>
          ¡Todo listo!
        </h1>
        <p style={{ fontSize: '13px', color: '#5a5f5c' }}>
          Tu zona ha sido configurada correctamente.
        </p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ color: '#4a7c59', marginTop: '2px' }}><MapPin size={18} /></div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{barrioReal}</div>
            <div style={{ fontSize: '12px', color: '#5a5f5c' }}>{barrio.sector}</div>
          </div>
        </div>
        
        <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.05)' }}></div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {barrio.horarios.slice(0,3).map(h => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ color: h.tipo === 'Reciclaje' ? '#4a7c59' : '#5a5f5c' }}>
                  {h.tipo === 'Reciclaje' ? <Recycle size={14} /> : <Truck size={14} />}
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{h.dia}</span>
                <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', padding: '2px 6px', border: `1px solid ${h.tipo === 'Reciclaje' ? '#4a7c59' : '#5a5f5c'}`, borderRadius: '4px', color: h.tipo === 'Reciclaje' ? '#4a7c59' : '#5a5f5c' }}>
                  {h.tipo.toUpperCase()}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#5a5f5c', fontWeight: 500 }}>{h.hora}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        <button 
          onClick={onFinish}
          style={{
            background: 'none', border: 'none', display: 'flex', alignItems: 'center',
            gap: '16px', cursor: 'pointer', padding: 0
          }}
        >
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%', background: '#4a7c59',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '18px',
            transition: 'transform 0.2s'
          }}>
            <ChevronRight size={20} strokeWidth={3} />
          </div>
          <span style={{ fontSize: '13px', color: '#fff', fontWeight: 800, letterSpacing: '3px' }}>
            ENTRAR A LA APP
          </span>
        </button>
      </div>
    </div>
  );
}

// ── TABS APP PRINCIPAL ──────────────────────────────────────────

function TabInicio({ barrio, onChangeTab }) {
  const prox = barrio.horarios.find(h => h.activo) || barrio.horarios[0];
  return (
    <div className="pc-content">
      {/* Hero */}
      <div style={{ backgroundColor: 'rgba(74, 124, 89, 0.05)', border: '1px solid rgba(74, 124, 89, 0.2)', borderRadius: '16px', padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--pc-primary)' }}>
          <Truck size={18} />
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em' }}>PRÓXIMA RECOLECCIÓN</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 800, lineHeight: 1.2 }}>{prox.dia}</div>
            <div style={{ fontSize: '13px', color: 'var(--pc-text-muted)', marginTop: '4px' }}>{prox.hora}</div>
            <div style={{ fontSize: '13px', marginTop: '2px', color: 'var(--pc-text-foreground)' }}>Residuos {prox.tipo.toLowerCase()}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            {prox.activo ? (
              <div className="pc-badge pc-badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(74, 124, 89, 0.15)', padding: '6px 12px', borderRadius: '16px' }}>
                <div className="animate-ping-custom" style={{ width: '6px', height: '6px', backgroundColor: 'var(--pc-primary)', borderRadius: '50%' }}></div>
                En camino
              </div>
            ) : (
              <div className="pc-badge" style={{ backgroundColor: 'var(--pc-bg-card)', color: 'var(--pc-text-muted)', border: '1px solid var(--pc-border)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={10} /> Programado
              </div>
            )}
            <div style={{ fontSize: '11px', color: 'var(--pc-text-muted)' }}>{barrio.sector}</div>
          </div>
        </div>
      </div>

      {/* Grid de residuos */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pc-text-muted)', marginBottom: '12px' }}>Separación de residuos</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '24px' }}>
        <div className="pc-card-sm pc-card pc-flex-center" style={{ flexDirection: 'column', gap: '8px', backgroundColor: 'var(--pc-bg-card)', border: '1px solid var(--pc-border)' }}>
          <Recycle size={24} color="var(--pc-text-muted)" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pc-text-muted)' }}>Ordinarios</span>
        </div>
        <div className="pc-card-sm pc-card pc-flex-center" style={{ flexDirection: 'column', gap: '8px', backgroundColor: 'var(--pc-bg-card)', border: '1px solid var(--pc-border)' }}>
          <Leaf size={24} color="var(--pc-primary)" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pc-text-muted)' }}>Reciclables</span>
        </div>
        <div className="pc-card-sm pc-card pc-flex-center" style={{ flexDirection: 'column', gap: '8px', backgroundColor: 'var(--pc-bg-card)', border: '1px solid var(--pc-border)' }}>
          <Flame size={24} color="var(--pc-status-danger)" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pc-text-muted)' }}>Peligrosos</span>
        </div>
      </div>

      {/* Reportar */}
      <div className="pc-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', cursor: 'pointer', marginBottom: '24px', backgroundColor: 'var(--pc-bg-card)', border: '1px solid var(--pc-border)' }} onClick={() => onChangeTab("reportar")}>
        <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
          <MessageSquareWarning size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>Reportar un problema</div>
          <div style={{ fontSize: '12px', color: 'var(--pc-text-muted)' }}>Camión, contenedor, punto sucio...</div>
        </div>
        <ChevronRight size={20} color="var(--pc-text-muted)" />
      </div>

      {/* Info tip */}
      <div style={{ backgroundColor: 'transparent', border: '1px solid var(--pc-border)', borderRadius: '16px', padding: '16px', display: 'flex', gap: '12px' }}>
        <Info size={20} color="var(--pc-primary)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '12px', color: 'var(--pc-text-muted)', lineHeight: '1.5' }}>
          Recuerda sacar tus bolsas <span style={{ fontWeight: 700, color: '#fff' }}>30 minutos antes</span> del horario de recolección y no bloquear el acceso vehicular.
        </div>
      </div>
    </div>
  );
}

function TabHorarios({ barrio }) {
  // Generar calendario del mes simulado (1 al 31)
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  return (
    <div className="pc-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', backgroundColor: 'var(--pc-bg-card)', border: '1px solid var(--pc-border)', borderRadius: '12px', marginBottom: '24px' }}>
        <MapPin size={16} color="var(--pc-primary)" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{barrio.nombre}</span>
          <span style={{ fontSize: '11px', color: 'var(--pc-text-muted)' }}>{barrio.sector}</span>
        </div>
        <span className="pc-badge pc-badge-primary">Detectado</span>
      </div>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Próximas recolecciones</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
        {barrio.horarios.map(h => (
          <div key={h.id} className="pc-card pc-card-sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: h.activo ? 'rgba(74, 124, 89, 0.05)' : 'var(--pc-bg-card)', borderColor: h.activo ? 'rgba(74, 124, 89, 0.3)' : 'var(--pc-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: h.activo ? 'rgba(0,255,157,0.2)' : 'var(--pc-bg-background)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: h.activo ? 'var(--pc-primary)' : 'var(--pc-text-muted)' }}>
                {h.tipo === 'Reciclaje' ? <Recycle size={18} /> : <Truck size={18} />}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>{h.dia}</div>
                <div style={{ fontSize: '12px', color: 'var(--pc-text-muted)' }}>{h.hora}</div>
              </div>
            </div>
            {h.activo && (
              <div className="pc-badge pc-badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div className="animate-ping-custom" style={{ width: '6px', height: '6px', backgroundColor: 'var(--pc-primary)', borderRadius: '50%' }}></div>
                Activo
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Calendario mensual</h2>
      <div className="pc-card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px', textAlign: 'center' }}>
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
            <div key={d} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pc-text-muted)' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {days.map(d => {
            const isHoy = d === 7;
            const isReci = barrio.diasReciclaje.includes(d);
            const isOrd = barrio.diasCalendario.includes(d) && !isReci;
            const hasRec = isReci || isOrd;
            
            let bg = 'transparent';
            let col = 'var(--pc-text-muted)';
            let opacity = 0.5;
            let fw = 400;

            if (isHoy) { bg = 'var(--pc-primary)'; col = '#fff'; opacity = 1; fw = 700; }
            else if (isReci) { bg = 'rgba(74, 124, 89, 0.15)'; col = 'var(--pc-primary)'; opacity = 1; fw = 600; }
            else if (isOrd) { bg = 'var(--pc-bg-secondary)'; col = 'var(--pc-text-foreground)'; opacity = 1; fw = 600; }

            return (
              <div key={d} style={{ height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: bg, color: col, opacity, fontWeight: fw, position: 'relative', fontSize: '12px' }}>
                {d}
                {!isHoy && hasRec && (
                  <div style={{ position: 'absolute', bottom: '2px', width: '4px', height: '4px', borderRadius: '50%', backgroundColor: isReci ? 'var(--pc-primary)' : 'var(--pc-text-muted)' }}></div>
                )}
              </div>
            );
          })}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--pc-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--pc-text-muted)' }}><div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'var(--pc-bg-secondary)' }}></div> Ordinarios</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--pc-text-muted)' }}><div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'rgba(74, 124, 89, 0.15)' }}></div> Reciclaje</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--pc-text-muted)' }}><div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'var(--pc-primary)' }}></div> Hoy</div>
        </div>
      </div>
    </div>
  );
}

function TabReportar({ onEnviado, barrioReal }) {
  const [step, setStep] = useState("form");
  const [nombre, setNombre] = useState(() => localStorage.getItem("pc_user_nombre") || "");
  const [tipo, setTipo] = useState(null);
  const [modoUbicacion, setModoUbicacion] = useState("gps");
  const [ubicacionGPS, setUbicacionGPS] = useState(() => barrioReal ? `Barrio ${barrioReal}, Neiva (Ubicación registrada)` : null);
  const [detectando, setDetectando] = useState(false);
  const [direccionManual, setDireccionManual] = useState("");
  const [foto, setFoto] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [desc, setDesc] = useState("");
  const [enviando, setEnviando] = useState(false);
  
  const fileInputRef = React.useRef(null);

  const photoRequired = tipo !== null && tipo !== 0 && tipo !== 5;

  const handleDetectGPS = () => {
    setDetectando(true);
    setTimeout(() => {
      setUbicacionGPS(`Cra 5 # 12-34, Barrio ${barrioReal || 'Centro'} (Detectado)`);
      setDetectando(false);
    }, 1800);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEnviar = async () => {
    // Validaciones explícitas para indicar qué campo falta completar
    if (!nombre.trim() || nombre.trim().length < 2) {
      alert("⚠️ Falta completar: Por favor, escribe tu nombre completo (mínimo 2 letras).");
      return;
    }
    if (tipo === null) {
      alert("⚠️ Falta completar: Por favor, selecciona el tipo de problema.");
      return;
    }
    if (modoUbicacion === 'gps' && !ubicacionGPS) {
      alert("⚠️ Falta completar: Por favor, detecta tu ubicación GPS o escribe la dirección manualmente.");
      return;
    }
    if (modoUbicacion === 'manual' && direccionManual.trim().length < 4) {
      alert("⚠️ Falta completar: Por favor, escribe la dirección del problema.");
      return;
    }
    if (photoRequired && !foto) {
      alert(`⚠️ Falta completar: Se requiere una foto de evidencia para el problema "${tiposReporte[tipo]}".`);
      return;
    }
    // Si el tipo es "Otro", la descripción es obligatoria
    if (tipo === 5 && !desc.trim()) {
      alert('⚠️ Falta completar: Cuando seleccionas "Otro" debes escribir una descripción del problema.');
      return;
    }

    setEnviando(true);
    try {
      // Usar FormData para enviar la foto como archivo real
      const formData = new FormData();
      formData.append('nombre_ciudadano', nombre);
      formData.append('tipo_problema', tiposReporte[tipo]);
      formData.append('latitud', 2.9273);
      formData.append('longitud', -75.2819);
      formData.append('descripcion', modoUbicacion === 'gps' ? ubicacionGPS : direccionManual);
      if (desc.trim()) formData.append('descripcion_extra', desc.trim());
      if (foto) formData.append('foto', foto); // archivo real

      const res = await crearReporteCiudadano(formData);
      
      setStep("success");
      setEnviando(false);
      
      setTimeout(() => {
        onEnviado({
          id: res.data.reporte.id,
          tipo: res.data.reporte.tipo_problema,
          direccion: res.data.reporte.descripcion,
          fecha: new Date().toLocaleDateString(),
          estado: 'en_revision'
        });
      }, 2500);
    } catch (e) {
      console.error('Error al enviar reporte:', e);
      setEnviando(false);
      alert('Error al enviar el reporte. Intenta de nuevo.');
    }
  };

  if (step === "success") {
    return (
      <div className="pc-centered">
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(74, 124, 89, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', color: 'var(--pc-primary)' }}>
          <CheckCircle2 size={32} />
        </div>
        <h1 className="pc-title">Reporte enviado</h1>
        <p className="pc-subtitle">Gracias por tu reporte. Nuestro equipo operativo ha sido notificado.</p>
        
        <div className="pc-card" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--pc-text-muted)' }}>Tipo</span>
            <span style={{ fontWeight: 600 }}>{tiposReporte[tipo]}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--pc-text-muted)' }}>Reportado por</span>
            <span style={{ fontWeight: 600 }}>{nombre}</span>
          </div>
          {foto && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--pc-text-muted)' }}>Evidencia</span>
              <span style={{ fontWeight: 600, color: 'var(--pc-primary)' }}>Foto adjunta</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pc-content">
      <div style={{ backgroundColor: 'rgba(96, 165, 250, 0.1)', border: '1px solid rgba(96, 165, 250, 0.25)', borderRadius: '12px', padding: '12px', display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <Info size={20} color="var(--pc-status-info)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '12px', color: 'var(--pc-status-info)', lineHeight: '1.5' }}>
          Tu reporte será enviado directamente al equipo operativo. Recibirás respuesta por correo cuando sea atendido.
        </div>
      </div>

      <div className="pc-mb-4">
        <label className="pc-label">Nombre completo {nombre.length < 2 && <span style={{color:'var(--pc-status-danger)'}}>*</span>}</label>
        <div className="pc-input-wrapper" style={{ marginBottom: 0 }}>
          <User size={18} className="pc-input-icon" />
          <input type="text" className="pc-input" placeholder="Ej. Ana Pérez Gómez" value={nombre} onChange={e => setNombre(e.target.value)} />
        </div>
      </div>

      <div className="pc-mb-4">
        <label className="pc-label">Tipo de problema {tipo === null && <span style={{color:'var(--pc-status-danger)'}}>*</span>}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tiposReporte.map((t, idx) => {
            const isAct = tipo === idx;
            return (
              <div key={idx} className={`pc-radio-item ${isAct ? 'active' : ''}`} style={{ marginBottom: 0 }} onClick={() => setTipo(idx)}>
                <div className="pc-radio-circle">{isAct && <div className="pc-radio-dot"></div>}</div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{t}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pc-mb-4">
        <label className="pc-label">Ubicación del problema {(modoUbicacion === 'gps' && !ubicacionGPS) || (modoUbicacion === 'manual' && direccionManual.length < 4) ? <span style={{color:'var(--pc-status-danger)'}}>*</span> : ''}</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button className={`pc-toggle-btn ${modoUbicacion === 'gps' ? 'active' : ''}`} onClick={() => setModoUbicacion('gps')}>Usar GPS actual</button>
          <button className={`pc-toggle-btn ${modoUbicacion === 'manual' ? 'active' : ''}`} onClick={() => setModoUbicacion('manual')}>Digitar dirección</button>
        </div>
        
        {modoUbicacion === 'gps' ? (
          ubicacionGPS ? (
            <div style={{ backgroundColor: 'rgba(0,255,157,0.1)', border: '1px solid rgba(0,255,157,0.3)', borderRadius: '12px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <MapPin size={18} color="var(--pc-primary)" />
              <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--pc-primary)' }}>{ubicacionGPS}</div>
              <X size={16} color="var(--pc-primary)" style={{ cursor: 'pointer' }} onClick={() => setUbicacionGPS(null)} />
            </div>
          ) : (
            <button className="pc-btn-secondary" onClick={handleDetectGPS} disabled={detectando} style={{ borderColor: 'var(--pc-primary)', color: 'var(--pc-primary)' }}>
              {detectando ? <Loader2 className="animate-spin-custom" size={18} /> : <LocateFixed size={18} />}
              {detectando ? "Detectando ubicación..." : "Detectar mi ubicación"}
            </button>
          )
        ) : (
          <div className="pc-input-wrapper" style={{ marginBottom: 0 }}>
            <MapPin size={18} className="pc-input-icon" />
            <input type="text" className="pc-input" placeholder="Ej. Cra 5 # 12-34, Barrio Centro" value={direccionManual} onChange={e => setDireccionManual(e.target.value)} />
          </div>
        )}
      </div>

      <div className="pc-mb-4">
        <label className="pc-label">
          Foto del problema <span style={{fontWeight: 400, color: photoRequired ? 'var(--pc-status-danger)' : 'var(--pc-text-muted)'}}>{photoRequired ? '*' : '(opcional)'}</span>
        </label>
        
        {/* Hidden Camera Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*"
          style={{ display: 'none' }} 
          onChange={handleFileChange} 
        />

        {foto ? (
          <div style={{ backgroundColor: 'rgba(0,255,157,0.1)', border: '1px solid rgba(0,255,157,0.3)', borderRadius: '12px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {fotoPreview ? (
              <img src={fotoPreview} alt="Vista previa" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--pc-border)' }} />
            ) : (
              <div style={{ width: '48px', height: '48px', borderRadius: '8px', backgroundColor: 'var(--pc-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Camera size={18} />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pc-text-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                {foto.name || 'Captura de cámara.jpg'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--pc-primary)' }}>Foto adjuntada correctamente</div>
            </div>
            <X size={16} color="var(--pc-text-muted)" style={{ cursor: 'pointer' }} onClick={() => { setFoto(null); setFotoPreview(null); }} />
          </div>
        ) : (
          <div style={{ border: '1px dashed var(--pc-border)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer', backgroundColor: 'var(--pc-bg-card)', transition: 'border-color 0.2s' }} onClick={() => fileInputRef.current?.click()}>
            <ImagePlus size={24} color="var(--pc-text-muted)" />
            <div style={{ fontSize: '13px', fontWeight: 600 }}>Adjuntar foto</div>
            <div style={{ fontSize: '11px', color: 'var(--pc-text-muted)' }}>Tomar foto con la cámara o subir de la galería</div>
          </div>
        )}
      </div>

      <div className="pc-mb-4">
        <label className="pc-label">
          Descripción adicional{' '}
          <span style={{fontWeight: 400, color: tipo === 5 ? 'var(--pc-status-danger)' : 'var(--pc-text-muted)'}}>
            {tipo === 5 ? '* (obligatorio)' : '(opcional)'}
          </span>
        </label>
        <textarea className="pc-textarea" placeholder={tipo === 5 ? 'Describe el problema con detalle...' : 'Escribe detalles adicionales aquí...'} value={desc} onChange={e => setDesc(e.target.value)}></textarea>
      </div>

      <button className="pc-btn-primary" disabled={enviando} onClick={handleEnviar}>
        {enviando ? <Loader2 className="animate-spin-custom" size={20} /> : <Send size={20} />}
        {enviando ? "Enviando..." : "Enviar reporte al administrador"}
      </button>
    </div>
  );
}

function TabMisReportes({ reportes }) {
  if (reportes.length === 0) {
    return (
      <div className="pc-centered">
        <MessageSquareWarning size={48} color="var(--pc-border)" style={{ marginBottom: '16px' }} />
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--pc-text-muted)' }}>No tienes reportes</h2>
        <p style={{ fontSize: '13px', color: 'var(--pc-text-muted)', textAlign: 'center', marginTop: '8px' }}>Los incidentes que reportes aparecerán aquí para que hagas seguimiento.</p>
      </div>
    );
  }

  const statusConfig = {
    'pendiente': { label: 'En revisión', color: 'var(--pc-status-warning)', icon: <Clock size={16} /> },
    'en_revision': { label: 'En revisión', color: 'var(--pc-status-warning)', icon: <Clock size={16} /> },
    'en_proceso': { label: 'En proceso', color: 'var(--pc-primary)', icon: <CheckCircle2 size={16} /> },
    'atendido': { label: 'Resuelto', color: 'var(--pc-primary)', icon: <CheckCircle2 size={16} /> },
    'resuelto': { label: 'Resuelto', color: 'var(--pc-primary)', icon: <CheckCircle2 size={16} /> },
    'rechazado': { label: 'Rechazado', color: 'var(--pc-status-danger)', icon: <XCircle size={16} /> }
  };

  return (
    <div className="pc-content">
      <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--pc-text-muted)', marginBottom: '16px' }}>{reportes.length} reportes realizados</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {reportes.map(r => {
          const horas = (new Date() - new Date(r.created_at)) / (1000 * 60 * 60);
          const expirado = r.estado === 'pendiente' && horas > 42;
          let st = statusConfig[r.estado] || statusConfig['en_revision'];
          if (expirado) st = { label: 'Expirado (>42h)', color: 'var(--pc-status-danger)', icon: <XCircle size={16} /> };

          const date = r.created_at ? new Date(r.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : r.fecha;
          const tipo = r.tipo_problema || r.tipo;
          const dir = r.descripcion || r.direccion;

          return (
            <div key={r.id} className="pc-card pc-card-sm" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'var(--pc-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pc-text-muted)', flexShrink: 0 }}>
                  <MessageSquareWarning size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8f9fa' }}>{tipo}</div>
                  <div style={{ fontSize: '12px', color: '#8C95A6', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dir}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    <span style={{ color: '#8C95A6' }}>{date}</span>
                    <span style={{ color: '#8C95A6' }}>·</span>
                    <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                  </div>
                </div>
                <div style={{ color: st.color }}>
                  {st.icon}
                </div>
              </div>

              {r.justificacion_rechazo && (
                <div style={{ marginTop: '4px', padding: '10px 12px', backgroundColor: r.estado === 'rechazado' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(74, 124, 89, 0.1)', border: r.estado === 'rechazado' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(74, 124, 89, 0.3)', borderRadius: '10px', fontSize: '12px', lineHeight: 1.4 }}>
                  <strong style={{ color: r.estado === 'rechazado' ? '#EF4444' : '#4a7c59', display: 'block', marginBottom: '2px' }}>
                    {r.estado === 'rechazado' ? 'Motivo del rechazo:' : '✅ Programado para recolección:'}
                  </strong>
                  <span style={{ color: '#e2e8f0' }}>{r.justificacion_rechazo}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
