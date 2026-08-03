import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API, { obtenerNotificaciones, marcarNotificacionLeida, marcarTodasLeidas } from '../../services/api';
import io from 'socket.io-client';
import GestionIncidenciaModal from '../Modals/GestionIncidenciaModal';

export default function Topbar() {
  const location = useLocation();
  const { usuario } = useAuth();
  const [notificaciones, setNotificaciones] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [socketConectado, setSocketConectado] = useState(false);
  const [toastActual, setToastActual] = useState(null);
  const [activeModalIncidenciaId, setActiveModalIncidenciaId] = useState(null);
  const [incidenciasActivasIds, setIncidenciasActivasIds] = useState([]);

  const unreadCount = notificaciones.filter(n => !n.leida).length;

  useEffect(() => {
    cargarNotificaciones();
    cargarIncidenciasActivas();

    const socketUrl = window.location.hostname === 'localhost' && window.location.port !== '3000' ? 'http://localhost:3000' : window.location.origin;
    const token = localStorage.getItem('token');
    const socket = io(socketUrl, {
      auth: { token }
    });
    
    socket.on('connect', () => setSocketConectado(true));
    socket.on('disconnect', () => setSocketConectado(false));

    socket.on('notificacion_nueva', (nueva) => {
      setNotificaciones(prev => [nueva, ...prev].slice(0, 20));
      setToastActual(nueva);
      setTimeout(() => setToastActual(null), 8000);
      try {
        const audio = new Audio('/notif_sound.mp3');
        audio.play().catch(() => {});
      } catch {}
    });

    return () => socket.disconnect();
  }, []);

  const cargarNotificaciones = async () => {
    try {
      const res = await obtenerNotificaciones();
      setNotificaciones(res.data.notificaciones || []);
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    }
  };

  const cargarIncidenciasActivas = async () => {
    try {
      const res = await API.get('/incidencias');
      if (res.data?.incidencias) {
        setIncidenciasActivasIds(res.data.incidencias.map(i => i.id));
      }
    } catch (e) {
      console.error('Error cargando incidencias activas:', e);
    }
  };

  const handleLeer = async (id) => {
    try {
      await marcarNotificacionLeida(id);
      setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
    } catch (error) {
      console.error(error);
    }
  };

  const handleLeerTodo = async () => {
    try {
      await marcarTodasLeidas();
      setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
    } catch (error) {
      console.error(error);
    }
  };

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Dashboard';
    if (path === '/rutas') return 'Gestión Semanal';
    if (path === '/monitoreo') return 'Monitoreo en Vivo';
    if (path === '/conductores') return 'Conductores';
    if (path === '/reportes') return 'Reportes Ciudadanos';
    if (path === '/reportes-operativos') return 'Reportes Operativos';
    if (path === '/historial') return 'Historial y Auditoría';
    return 'CollTrash';
  };

  const getTipoColor = (tipo) => {
    if (tipo === 'urgente') return '#ff4d4d';
    if (tipo === 'operativo') return 'var(--color-primary)';
    if (tipo === 'comunidad') return 'var(--color-accent)';
    return '#888';
  };

  return (
    <header className="topbar">
      <div className="page-info">
        <p>Administración / <span style={{ color: 'var(--text-primary)' }}>Gestión de residuos CollTrash</span></p>
        <h1 style={{ marginTop: '4px' }}>{getPageTitle()}</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div className={`status-badge ${socketConectado ? 'status-active' : ''}`} style={{ backgroundColor: socketConectado ? 'rgba(0, 255, 157, 0.1)' : 'rgba(255,255,255,0.05)', color: socketConectado ? 'var(--color-primary)' : '#888' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: socketConectado ? 'var(--color-primary)' : '#888' }}></div>
          {socketConectado ? 'En línea' : 'Desconectado'}
        </div>
        
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bi bi-calendar3"></i>
          <span style={{ textTransform: 'capitalize' }}>
            {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>

        <div style={{ position: 'relative' }}>
          <div 
            onClick={() => setAbierto(!abierto)}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '50%', background: abierto ? 'rgba(255,255,255,0.05)' : 'transparent', transition: 'all 0.2s' }}
          >
            <i className="bi bi-bell" style={{ fontSize: '20px', color: unreadCount > 0 ? 'white' : 'var(--text-muted)' }}></i>
            {unreadCount > 0 && (
              <div style={{ 
                position: 'absolute', 
                top: '5px', 
                right: '5px', 
                width: '16px', 
                height: '16px', 
                backgroundColor: 'var(--color-danger)', 
                borderRadius: '50%', 
                border: '2px solid var(--bg-global)', 
                fontSize: '9px', 
                fontWeight: 700,
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'white'
              }}>
                {unreadCount}
              </div>
            )}
          </div>

          {/* Panel de Notificaciones Dropdown */}
          {abierto && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setAbierto(false)}></div>
              <div style={{ 
                position: 'absolute', 
                top: '50px', 
                right: '0', 
                width: '320px', 
                background: '#1a1a1a', 
                borderRadius: '12px', 
                border: '1px solid #333', 
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)', 
                zIndex: 999,
                overflow: 'hidden'
              }}>
                <div style={{ padding: '15px 20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'white' }}>Notificaciones</span>
                  {unreadCount > 0 && (
                    <button onClick={handleLeerTodo} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                      Marcar todo como leído
                    </button>
                  )}
                </div>

                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {notificaciones.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      <i className="bi bi-bell-slash" style={{ fontSize: '24px', display: 'block', marginBottom: '10px' }}></i>
                      No tienes notificaciones nuevas
                    </div>
                  ) : (
                    notificaciones.map((n) => (
                      <div 
                        key={n.id} 
                        onClick={() => {
                          handleLeer(n.id);
                          window.location.href = `/historial?tab=notificaciones&noti_id=${n.id}`;
                        }}
                        style={{ 
                          padding: '15px 20px', 
                          borderBottom: '1px solid #222', 
                          background: n.leida ? 'transparent' : 'rgba(0, 255, 157, 0.03)',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = n.leida ? 'transparent' : 'rgba(0, 255, 157, 0.03)'}
                      >
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <div style={{ 
                            width: '8px', height: '8px', borderRadius: '50%', 
                            background: getTipoColor(n.tipo), 
                            marginTop: '5px',
                            boxShadow: `0 0 10px ${getTipoColor(n.tipo)}`
                          }}></div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'white', marginBottom: '4px' }}>{n.titulo}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>{n.mensaje}</div>
                            <div style={{ fontSize: '10px', color: '#555', marginTop: '8px' }}>
                              {new Date(n.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            {['urgente', 'incidencia', 'operativo'].includes(n.tipo) && n.metadata?.incidencia_id && (
                               incidenciasActivasIds.includes(n.metadata.incidencia_id) ? (
                                 <button 
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setAbierto(false);
                                     setActiveModalIncidenciaId(n.metadata.incidencia_id);
                                   }}
                                   style={{ display: 'inline-block', marginTop: '10px', padding: '6px 10px', background: getTipoColor(n.tipo), color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}
                                 >
                                   Gestionar / Resolver
                                 </button>
                               ) : (
                                 <span style={{ display: 'inline-block', marginTop: '10px', fontSize: '11px', color: '#10b981', fontWeight: 600 }}>
                                   <i className="bi bi-check-circle-fill" style={{ marginRight: '4px' }}></i> Resuelto
                                 </span>
                               )
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                <div style={{ padding: '12px', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
                   <a href="/historial?tab=notificaciones" style={{ fontSize: '12px', color: '#888', textDecoration: 'none' }}>Ver bitácora completa</a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Global Toast */}
      {toastActual && (
        <div style={{
          position: 'fixed', top: '70px', right: '20px', zIndex: 9999,
          background: 'var(--bg-card)', border: `1px solid ${getTipoColor(toastActual.tipo)}`,
          borderLeft: `4px solid ${getTipoColor(toastActual.tipo)}`,
          borderRadius: '12px', padding: '16px 20px', width: '320px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <button onClick={() => setToastActual(null)} style={{ position: 'absolute', top: '8px', right: '12px', background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '16px' }}>✕</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '18px' }}>
              {toastActual.tipo === 'urgente' ? '🚨' : toastActual.tipo === 'operativo' ? '🚛' : '⚠️'}
            </span>
            <h4 style={{ margin: 0, fontSize: '14px', color: getTipoColor(toastActual.tipo) }}>{toastActual.titulo}</h4>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#ccc', lineHeight: '1.4' }}>{toastActual.mensaje}</p>
          {['urgente', 'incidencia', 'operativo'].includes(toastActual.tipo) && toastActual.metadata?.incidencia_id && (
             <button 
               onClick={(e) => {
                 e.stopPropagation();
                 setToastActual(null);
                 setActiveModalIncidenciaId(toastActual.metadata.incidencia_id);
               }}
               style={{ display: 'inline-block', marginTop: '12px', padding: '6px 12px', background: getTipoColor(toastActual.tipo), color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}
             >
               Gestionar / Resolver
             </button>
          )}
        </div>
      )}
      
      {activeModalIncidenciaId && (
        <GestionIncidenciaModal 
          incidenciaId={activeModalIncidenciaId} 
          onClose={() => setActiveModalIncidenciaId(null)} 
          onResolved={(id) => {
             window.location.reload(); 
          }}
        />
      )}
    </header>
  );
}
