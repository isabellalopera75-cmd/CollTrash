import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API, { obtenerNotificaciones, marcarNotificacionLeida, marcarTodasLeidas } from '../../services/api';
import io from 'socket.io-client';
import GestionIncidenciaModal from '../Modals/GestionIncidenciaModal';
import { iconoNotificacion, colorNotificacion, tituloNotificacion } from '../../utils/notificaciones';

// Tiempo que un aviso flotante permanece en pantalla antes de ocultarse solo.
const DURACION_TOAST_MS = 3000;
// Avisos flotantes visibles a la vez.
const MAX_TOASTS = 4;

/**
 * Destino al pulsar una notificacion.
 *
 * Un aviso de reporte ciudadano lleva a la ficha del reporte, que es donde
 * estan la foto, la ubicacion en el mapa, el texto del ciudadano y los botones
 * de aceptar o rechazar. Antes todas las notificaciones, fuese cual fuese su
 * asunto, terminaban en la bitacora de notificaciones: el administrador leia el
 * mismo texto que ya habia leido en el aviso y tenia que ir a buscar el reporte
 * a mano.
 */
const destinoNotificacion = (n) => {
  const reporteId = n?.metadata?.reporte_id;
  if (reporteId) return `/reportes?reporte_id=${reporteId}`;
  return `/historial?tab=notificaciones&noti_id=${n.id}`;
};

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [notificaciones, setNotificaciones] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [socketConectado, setSocketConectado] = useState(false);
  const [toastsActivos, setToastsActivos] = useState([]);
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
      // La lista del panel va de la mas reciente a la mas antigua, igual que la
      // consulta del servidor. Se descarta el duplicado por si el mismo aviso
      // llega dos veces tras una reconexion del socket.
      setNotificaciones(prev => (
        prev.some(n => n.id === nueva.id) ? prev : [nueva, ...prev].slice(0, 20)
      ));

      // Los avisos flotantes se apilan en orden de llegada: el primero arriba y
      // cada nuevo debajo. Se limitan a MAX_TOASTS para que una rafaga (fin de
      // descarga, ruta finalizada y reporte casi a la vez) no tape la pantalla.
      setToastsActivos(prev => (
        prev.some(t => t.id === nueva.id) ? prev : [...prev, nueva].slice(-MAX_TOASTS)
      ));
      setTimeout(() => {
        setToastsActivos(prev => prev.filter(t => t.id !== nueva.id));
      }, DURACION_TOAST_MS);
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

  const getTipoColor = colorNotificacion;

  return (
    <header className="topbar">
      <div className="page-info">
        <p>Administración / <span style={{ color: 'var(--text-primary)' }}>Gestión de residuos CollTrash</span></p>
        <h1 style={{ marginTop: '4px' }}>{getPageTitle()}</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div className={`status-badge ${socketConectado ? 'status-active' : ''}`} style={{ backgroundColor: socketConectado ? 'var(--marca-suave)' : 'var(--borde)', color: socketConectado ? 'var(--color-primary)' : 'var(--texto-3)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: socketConectado ? 'var(--color-primary)' : 'var(--texto-3)' }}></div>
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
            style={{ position: 'relative', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '50%', background: abierto ? 'var(--borde)' : 'transparent', transition: 'all 0.2s' }}
          >
            <i className="bi bi-bell" style={{ fontSize: '20px', color: unreadCount > 0 ? 'var(--texto)' : 'var(--text-muted)' }}></i>
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
                color: 'var(--texto)'
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
                background: 'var(--superficie)', 
                borderRadius: '12px', 
                border: '1px solid var(--borde)', 
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)', 
                zIndex: 999,
                overflow: 'hidden'
              }}>
                <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--borde)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--superficie-2)' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--texto)' }}>Notificaciones</span>
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
                          setAbierto(false);
                          // navigate y no window.location.href: recargar la
                          // pagina entera tiraba la conexion del socket y
                          // volvia a pedir todas las consultas del panel.
                          navigate(destinoNotificacion(n));
                        }}
                        style={{ 
                          padding: '15px 20px', 
                          borderBottom: '1px solid var(--superficie-2)', 
                          background: n.leida ? 'transparent' : 'var(--marca-suave-2)',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--borde)'}
                        onMouseLeave={e => e.currentTarget.style.background = n.leida ? 'transparent' : 'var(--marca-suave-2)'}
                      >
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <i className={`bi ${iconoNotificacion(n)}`} style={{ fontSize: '15px', color: getTipoColor(n.tipo), marginTop: '2px' }}></i>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--texto)', marginBottom: '4px' }}>{tituloNotificacion(n.titulo)}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>{n.mensaje}</div>
                            <div style={{ fontSize: '10px', color: 'var(--texto-3)', marginTop: '8px' }}>
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
                                   style={{ display: 'inline-block', marginTop: '10px', padding: '6px 10px', background: getTipoColor(n.tipo), color: 'var(--texto)', border: 'none', cursor: 'pointer', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}
                                 >
                                   Gestionar / Resolver
                                 </button>
                               ) : (
                                 <span style={{ display: 'inline-block', marginTop: '10px', fontSize: '11px', color: 'var(--exito)', fontWeight: 600 }}>
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
                   <a href="/historial?tab=notificaciones" style={{ fontSize: '12px', color: 'var(--texto-3)', textDecoration: 'none' }}>Ver bitácora completa</a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Global Toasts */}
      <div style={{ position: 'fixed', top: '70px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {toastsActivos.map((toast) => (
          <div
            key={toast.id}
            // El aviso flotante lleva al mismo sitio que su entrada en el panel.
            // Con tres segundos en pantalla, obligar a abrir la campana para
            // llegar al reporte hacia el atajo inservible.
            onClick={() => {
              setToastsActivos(prev => prev.filter(t => t.id !== toast.id));
              handleLeer(toast.id);
              navigate(destinoNotificacion(toast));
            }}
            style={{
            background: 'var(--bg-card)', border: `1px solid ${getTipoColor(toast.tipo)}`,
            borderLeft: `4px solid ${getTipoColor(toast.tipo)}`,
            borderRadius: '12px', padding: '16px 20px', width: '320px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            animation: 'slideIn 0.3s ease-out',
            position: 'relative',
            cursor: 'pointer'
          }}>
            <button onClick={(e) => { e.stopPropagation(); setToastsActivos(prev => prev.filter(t => t.id !== toast.id)); }} style={{ position: 'absolute', top: '8px', right: '12px', background: 'none', border: 'none', color: 'var(--texto-3)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <i className={`bi ${iconoNotificacion(toast)}`} style={{ fontSize: '16px', color: getTipoColor(toast.tipo) }}></i>
              <h4 style={{ margin: 0, fontSize: '14px', color: getTipoColor(toast.tipo) }}>{tituloNotificacion(toast.titulo)}</h4>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--texto-2)', lineHeight: '1.4' }}>{toast.mensaje}</p>
            {['urgente', 'incidencia', 'operativo'].includes(toast.tipo) && toast.metadata?.incidencia_id && (
               <button 
                 onClick={(e) => {
                   e.stopPropagation();
                   setToastsActivos(prev => prev.filter(t => t.id !== toast.id));
                   setActiveModalIncidenciaId(toast.metadata.incidencia_id);
                 }}
                 style={{ display: 'inline-block', marginTop: '12px', padding: '6px 12px', background: getTipoColor(toast.tipo), color: 'var(--texto)', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}
               >
                 Gestionar / Resolver
               </button>
            )}
          </div>
        ))}
      </div>
      
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
