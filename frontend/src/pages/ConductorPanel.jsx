import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import { TabRuta, TabParadas, TabNovedades } from './ConductorTabs';
import { io } from 'socket.io-client';

// Neiva como fallback de posición para el mapa
const NEIVA = [2.9273, -75.2819];
const FAKE_TRAZADO = [[2.927,-75.282],[2.929,-75.283],[2.931,-75.284],[2.933,-75.285],[2.935,-75.284],[2.936,-75.282],[2.937,-75.280],[2.938,-75.278]];

const fechaColombia = (dias = 0) => {
  const ahora = new Date();
  const colombia = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  colombia.setDate(colombia.getDate() + dias);
  const yyyy = colombia.getFullYear();
  const mm = String(colombia.getMonth() + 1).padStart(2, '0');
  const dd = String(colombia.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const normalizarFecha = (fecha) => {
  if (!fecha) return null;
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  return new Date(fecha).toISOString().split('T')[0];
};

export default function ConductorPanel() {
  const { usuario, cerrarSesion } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('ruta');
  const [asignacion, setAsignacion] = useState(null);
  const [paradas, setParadas] = useState([]);
  const [reportesCiudadanos, setReportesCiudadanos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [iniciado, setIniciado] = useState(false);
  const [completando, setCompletando] = useState(false);
  const [posicion, setPosicion] = useState(NEIVA);
  const [progreso, setProgreso] = useState(0);
  const [rutaRecorrida, setRutaRecorrida] = useState(false);
  const simRef = useRef(null);
  const timerRef = useRef(null);
  const socketRef = useRef(null);
  const reportesAvisadosRef = useRef('');
  const [tiempoMin, setTiempoMin] = useState(0);
  const [mostrarModalTardio, setMostrarModalTardio] = useState(false);
  const [justificacionTardio, setJustificacionTardio] = useState('');
  
  const [mostrarModalFin, setMostrarModalFin] = useState(false);
  const [toneladas, setToneladas] = useState('');
  const [kmFinales, setKmFinales] = useState(0);

  useEffect(() => { 
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#0a0a0a';

    const socketUrl = window.location.hostname === 'localhost' && window.location.port !== '3000' ? 'http://localhost:3000' : window.location.origin;
    const token = localStorage.getItem('token');
    socketRef.current = io(socketUrl, {
      auth: { token }
    });
    socketRef.current.on('notificacion_nueva', (notificacion) => {
      if (notificacion?.metadata?.tipo !== 'REPORTE_ASIGNADO') return;

      alert(`ATENCION CONDUCTOR:\n${notificacion.mensaje}\nRevisa los detalles en la pestana Paradas.`);
      setTab('paradas');
      cargar(normalizarFecha(notificacion?.metadata?.fecha));
    });
    cargar(); 
    return () => { 
      clearInterval(simRef.current); 
      clearInterval(timerRef.current); 
      if (window.emitIntervalRef) clearInterval(window.emitIntervalRef);
      if (socketRef.current) socketRef.current.disconnect();
      document.body.style.backgroundColor = prevBg;
    }; 
  }, []);

  const detectarRutaRecorrida = (paradasActuales, estadoAsignacion) => {
    const totalParadas = paradasActuales.length;
    const completadasDb = paradasActuales.filter(p => p.estado === 'completado' || Number(p.porcentaje_recorrido) >= 100).length;
    const recorrida = totalParadas > 0 && completadasDb === totalParadas && estadoAsignacion !== 'completada';

    if (recorrida) {
      setProgreso(100);
      setRutaRecorrida(true);
    }

    return recorrida;
  };

  const cargar = async (fechaObjetivo = null) => {
    try {
      setCargando(true);
      const fechas = fechaObjetivo ? [fechaObjetivo] : [fechaColombia(0), fechaColombia(1), fechaColombia(2)];
      let ra = null;
      let a = null;

      for (const fecha of fechas) {
        ra = await API.get(`/conductor/mi-asignacion?fecha=${fecha}`);
        a = ra.data.asignacion;
        if (a) break;
      }

      if (!a) {
        setAsignacion(null);
        setParadas([]);
        setReportesCiudadanos([]);
        setRutaRecorrida(false);
        setProgreso(0);
        return;
      }

      setAsignacion(a);
      setReportesCiudadanos(ra.data.reportesCiudadanos || []);
      if (a) {
        setRutaRecorrida(Boolean(a.ruta_recorrida));
        setProgreso(Number(a.progreso_recorrido) || 0);
        if (a.km_recorridos) setKmFinales(a.km_recorridos);
        const rp = await API.get(`/conductor/mis-paradas/${a.id}`);
        const pp = rp.data.paradas;
        setParadas(pp);
        detectarRutaRecorrida(pp, a.estado);
        const primerTrazado = pp.find(p => p.trazado_geom);
        if (primerTrazado) {
          try { setPosicion(JSON.parse(primerTrazado.trazado_geom)[0]); } catch {}
        }
      }
      // si a === null, no se carga nada — se mostrará la pantalla de sin asignación
    } catch (e) {
      console.error('Error al cargar asignación:', e.message);
    }
    finally { setCargando(false); }
  };

  useEffect(() => {
    if (!asignacion || !socketRef.current) return;
    
    if (asignacion.estado === 'activa' && !iniciado) {
      setIniciado(true);
    }

    const handlePosicion = (data) => {
      setPosicion([data.lat, data.lng]);
      if (data.progreso !== undefined && data.progreso !== null) {
        const nuevoProgreso = Number(data.progreso);
        setProgreso(nuevoProgreso);
      }
      if (data.km) setKmFinales(data.km);
    };
    
    const handleCompletada = (data) => {
      setProgreso(100);
      setRutaRecorrida(true);
      if (data?.km_finales) setKmFinales(data.km_finales);
      setMostrarModalFin(true);
      cargar(); 
    };

    socketRef.current.on(`posicion_conductor_${asignacion.id}`, handlePosicion);
    socketRef.current.on(`simulacion_completada_${asignacion.id}`, handleCompletada);

    return () => {
      socketRef.current.off(`posicion_conductor_${asignacion.id}`, handlePosicion);
      socketRef.current.off(`simulacion_completada_${asignacion.id}`, handleCompletada);
    };
  }, [asignacion]);

  useEffect(() => {
    if (cargando || !asignacion) return;

    const reportesPendientes = reportesCiudadanos.filter(r => r.estado === 'en_proceso');
    if (reportesPendientes.length === 0) return;

    const avisoKey = `${asignacion.id}:${reportesPendientes.map(r => r.id).join(',')}`;
    if (reportesAvisadosRef.current === avisoKey) return;
    reportesAvisadosRef.current = avisoKey;

    alert(`ATENCION CONDUCTOR:\nTienes ${reportesPendientes.length} reporte(s) ciudadano(s) asignado(s) para tener en cuenta durante esta ruta.\nRevisa los detalles en la pestana Paradas.`);
  }, [cargando, asignacion, reportesCiudadanos]);

  const iniciarRecorrido = async (justificacion = null) => {
    if (iniciado) return;
    if (asignacion) {
      try { 
        const res = await API.put(`/conductor/asignacion/${asignacion.id}/iniciar`, { justificacion });
        
        if (res.data.requiere_justificacion) {
          setMostrarModalTardio(true);
          return;
        }

        setIniciado(true);
        setMostrarModalTardio(false);
        // marcar primera parada como en_curso si no lo está
        setParadas(prev => prev.map((p, i) => i === 0 && p.estado === 'pendiente' ? { ...p, estado: 'en_curso' } : p));
        // timer minutos locales
        timerRef.current = setInterval(() => setTiempoMin(m => m + 1), 60000);

      } catch (e) {
        console.error('❌ ERROR AL INICIAR RUTA:', e.response?.data || e.message);
      }
    }
  };

  const resolverReporte = async (reporteId) => {
    try {
      await API.put(`/conductor/reporte/${reporteId}/resolver`);
      alert('✅ Reporte ciudadano marcado como RESUELTO con éxito');
      cargar();
    } catch (e) {
      console.error('Error al resolver reporte:', e);
      alert('Error al resolver el reporte ciudadano');
    }
  };

  const finalizarJornada = async () => {
    if (!toneladas) return alert('Por favor ingresa las toneladas recolectadas');
    try {
      await API.put(`/conductor/asignacion/${asignacion.id}/finalizar`, { toneladas });
      setIniciado(false);
      setMostrarModalFin(false);
      window.location.reload(); 
    } catch (e) {
      console.error('Error al finalizar:', e.response?.data || e.message);
    }
  };

  const completarParada = async (saId) => {
    if (completando) return;
    setCompletando(true);
    await new Promise(r => setTimeout(r, 1200));
    try {
      const parada = paradas.find(p => p.id === saId);
      if (asignacion && parada) {
        await API.put(`/conductor/asignacion/${asignacion.id}/sector/${parada.sector_id}/progreso`, { porcentaje_recorrido: 100 });
      }
    } catch (e) {
      console.error('Error al completar parada:', e);
    }
    setParadas(prev => {
      const idx = prev.findIndex(p => p.id === saId);
      return prev.map((p, i) => {
        if (p.id === saId) return { ...p, estado: 'completado', completado_at: new Date().toISOString() };
        if (i === idx + 1) return { ...p, estado: 'en_curso' };
        return p;
      });
    });
    setCompletando(false);
  };

  // Stats calculados
  const total = paradas.length;
  const completadasPorAvance = paradas.filter(p => p.estado === 'completado' || Number(p.porcentaje_recorrido) >= 100).length;
  const completadas = completadasPorAvance;
  const porcentajeParadas = total ? Math.round((completadasPorAvance / total) * 100) : 0;
  const porcentaje = Math.max(porcentajeParadas, Math.round(Number(progreso) || 0));
  const fechaAsignacion = normalizarFecha(asignacion?.fecha);
  const asignacionEsHoy = !fechaAsignacion || fechaAsignacion === fechaColombia(0);
  const puedeCerrarRuta = asignacionEsHoy && iniciado && asignacion?.estado !== 'completada' && rutaRecorrida;
  const reportesPendientesRuta = reportesCiudadanos.filter(r => r.estado === 'en_proceso').length;

  // Calcular distancia aproximada recorrida (Haversine sobre el trazado simulado)
  const calcularKmEstimados = () => {
    const trazado = FAKE_TRAZADO;
    let totalKm = 0;
    for (let i = 1; i < trazado.length; i++) {
      const [lat1, lng1] = trazado[i - 1];
      const [lat2, lng2] = trazado[i];
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
      totalKm += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    // Escalar por paradas completadas y un factor de tortuosidad de calles
    const factor = total > 0 ? completadas / total : 1;
    return (totalKm * factor * 1.35).toFixed(1);
  };

  const s = { // estilos reutilizables
    bg: '#0a0a0a', card: '#111111', border: '#1f2937',
    green: '#22c55e', amber: '#F59E0B', muted: '#6b7280',
  };

  return (
    <>
      <style>{`
        @keyframes pulsar { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .dot-pulsar { animation: pulsar 1.5s ease-in-out infinite; }
        .cp-wrapper {
          min-height: 100vh; min-height: 100svh; height: 100dvh; width: 100%; background-color: #05070A; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; overflow: hidden;
        }
        .cp-container {
          width: 100%; max-width: 430px; height: 100%; max-height: 920px; background-color: #0a0a0a; display: flex; flex-direction: column; position: relative; overflow: hidden; border: 1px solid #1f2937; border-radius: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.85), 0 0 50px rgba(34,197,94,0.08); fontFamily: Inter, sans-serif;
        }
        @media (max-width: 768px) {
          html, body, #root { margin: 0; padding: 0; width: 100%; min-height: 100%; overflow: hidden; }
          .cp-wrapper { padding: 0; background-color: #0a0a0a; width: 100%; min-height: 100svh; height: 100dvh; overflow: hidden; align-items: stretch; justify-content: stretch; }
          .cp-container { max-width: 100%; height: 100%; max-height: none; border: none; border-radius: 0; box-shadow: none; display: flex; flex-direction: column; overflow: hidden; }
        }
      `}</style>

      <div className="cp-wrapper">
        <div className="cp-container">

        {/* STATUS BAR */}
        <div style={{ background: '#050505', padding: 'calc(6px + env(safe-area-inset-top, 0px)) 16px 6px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: s.green }}>
            <span className="dot-pulsar" style={{ width: 7, height: 7, borderRadius: '50%', background: s.green, display: 'inline-block' }}></span>
            {iniciado ? 'En ruta' : 'Listo'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: s.muted }}>
            <i className="bi bi-wifi"></i> GPS activo
          </div>
        </div>

        {/* HEADER */}
        <div style={{ padding: '12px 16px', background: s.card, borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="bi bi-truck-front-fill" style={{ color: s.green, fontSize: '18px' }}></i>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{usuario?.nombre || 'Conductor'}</div>
            <div style={{ fontSize: '11px', color: s.muted }}>
              {asignacion?.vehiculo_placa || 'Sin placa'} · {asignacion?.ruta_nombre || 'Sin ruta asignada'}{fechaAsignacion && !asignacionEsHoy ? ` · ${fechaAsignacion}` : ''}
            </div>
          </div>
          <button onClick={() => { cerrarSesion(); navigate('/login'); }} style={{ background: 'none', border: 'none', color: s.muted, cursor: 'pointer', fontSize: '18px', padding: '4px' }} title="Cerrar sesión">
            <i className="bi bi-box-arrow-right"></i>
          </button>
        </div>

        {/* PROGRESS BANNER */}
        <div style={{ padding: '12px 16px', background: '#0d0d0d', borderBottom: `1px solid ${s.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'white' }}>{completadas}/{total} paradas</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: s.green }}>{porcentaje}%</span>
          </div>
          <div style={{ height: 5, background: '#1f2937', borderRadius: 3 }}>
            <div style={{ height: '100%', width: `${porcentaje}%`, background: s.green, borderRadius: 3, transition: 'width 0.5s ease' }}></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '10px', color: s.muted }}>Inicio: {asignacion?.hora_inicio ? String(asignacion.hora_inicio).substring(0, 5) : '--:--'}</span>
            <span style={{ fontSize: '10px', color: s.muted }}>{tiempoMin}min en ruta</span>
            <span style={{ fontSize: '10px', color: s.muted }}>Fin est.: {asignacion?.hora_limite_fin ? String(asignacion.hora_limite_fin).substring(0, 5) : '--:--'}</span>
          </div>
        </div>

        {/* ALERTA DE REPORTES CIUDADANOS ASIGNADOS */}
        {asignacion && reportesPendientesRuta > 0 && (
          <div onClick={() => setTab('paradas')} style={{ padding: '10px 16px', background: 'rgba(239, 68, 68, 0.15)', borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <span className="dot-pulsar" style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
            <span style={{ fontSize: '11px', color: '#fca5a5', fontWeight: 600, flex: 1 }}>
              ⚠️ Tienes {reportesCiudadanos.filter(r => r.estado === 'en_proceso').length} reporte(s) ciudadano(s) pendiente(s) hoy.
            </span>
          </div>
        )}

        {/* TABS */}
        <div style={{ display: 'flex', background: s.card, borderBottom: `1px solid ${s.border}` }}>
          {[['ruta','bi-map-fill','Ruta'],['paradas','bi-list-check','Paradas'],['novedades','bi-exclamation-triangle-fill','Novedades']].map(([key,icon,label]) => {
            const bloqueado = key === 'novedades' && (!asignacion || !iniciado);
            return (
              <button
                key={key}
                onClick={() => !bloqueado && setTab(key)}
                style={{ flex: 1, padding: '12px 0', background: 'none', border: 'none', cursor: bloqueado ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', borderBottom: `2px solid ${tab === key ? s.green : 'transparent'}`, opacity: bloqueado ? 0.4 : 1 }}
                title={bloqueado ? 'Solo disponible cuando estés en ruta' : ''}
              >
                <i className={`bi ${icon}`} style={{ fontSize: '16px', color: tab === key ? s.green : s.muted }}></i>
                <span style={{ fontSize: '10px', fontWeight: 600, color: tab === key ? s.green : s.muted }}>{label}</span>
                {bloqueado && <i className="bi bi-lock-fill" style={{ fontSize: '8px', color: s.muted, marginTop: '-2px' }}></i>}
              </button>
            );
          })}
        </div>

        {/* CONTENT: Sin asignación → pantalla de bloqueo */}
        {cargando ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.muted }}>
            <i className="bi bi-arrow-repeat" style={{ fontSize: '24px' }}></i>
          </div>
        ) : !asignacion ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: '20px', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(107,114,128,0.1)', border: '1px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="bi bi-calendar-x" style={{ fontSize: '32px', color: '#6b7280' }}></i>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>Sin ruta asignada hoy</div>
              <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>
                No tienes ninguna ruta programada para el día de hoy.<br />
                Consulta con el administrador si crees que es un error.
              </div>
            </div>
            <button
              onClick={() => { cerrarSesion(); navigate('/login'); }}
              style={{ padding: '12px 28px', borderRadius: '10px', border: '1px solid #374151', background: 'transparent', color: '#9ca3af', fontWeight: 600, cursor: 'pointer', fontSize: '14px', marginTop: '8px' }}
            >
              <i className="bi bi-box-arrow-right" style={{ marginRight: '8px' }}></i>Cerrar sesión
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Botón iniciar flotante (solo si no inició y no ha expirado) */}
            {!iniciado && tab === 'ruta' && (
              (() => {
                if (!asignacionEsHoy) {
                  return (
                    <div style={{ padding: '12px 16px', background: 'rgba(245, 158, 11, 0.1)', borderBottom: `1px solid ${s.border}`, textAlign: 'center' }}>
                      <span style={{ color: s.amber, fontSize: '13px', fontWeight: 700 }}>
                        <i className="bi bi-calendar-event" style={{ marginRight: '8px' }}></i>
                        Ruta programada para {fechaAsignacion}
                      </span>
                    </div>
                  );
                }

                const [hf, mf] = (asignacion?.hora_limite_fin || '23:59:59').split(':');
                const fin = new Date();
                fin.setHours(parseInt(hf), parseInt(mf), 0);
                const expirada = new Date() > fin;

                if (expirada) {
                  return (
                    <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', borderBottom: `1px solid ${s.border}`, textAlign: 'center' }}>
                      <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: 700 }}>
                        <i className="bi bi-exclamation-octagon-fill" style={{ marginRight: '8px' }}></i>
                        JORNADA EXPIRADA (Finalizó {asignacion?.hora_limite_fin?.substring(0, 5)})
                      </span>
                    </div>
                  );
                }

                return (
                  <div style={{ padding: '12px 16px', background: '#0d0d0d', borderBottom: `1px solid ${s.border}` }}>
                    <button onClick={() => iniciarRecorrido()} style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: s.green, color: '#000', fontWeight: 800, fontSize: '15px', cursor: 'pointer' }}>
                      <i className="bi bi-play-fill" style={{ marginRight: '8px' }}></i>Iniciar Recorrido
                    </button>
                  </div>
                );
              })()
            )}

            {/* Botón finalizar ruta (solo si llegó al 100%) */}
            {puedeCerrarRuta && tab === 'ruta' && (
              <div style={{ padding: '12px 16px', background: '#0d0d0d', borderBottom: `1px solid ${s.border}` }}>
                <button onClick={() => {
                  // Si el backend no envió km via socket, calcular localmente
                  if (!kmFinales || kmFinales === 0) setKmFinales(parseFloat(calcularKmEstimados()));
                  setMostrarModalFin(true);
                }} style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: s.amber, color: '#000', fontWeight: 800, fontSize: '15px', cursor: 'pointer', animation: 'pulsar 2s infinite' }}>
                  <i className="bi bi-check2-circle" style={{ marginRight: '8px' }}></i>Finalizar Ruta
                </button>
              </div>
            )}

            {tab === 'ruta' && <TabRuta paradas={paradas} posicion={posicion} asignacion={asignacion} reportesCiudadanos={reportesCiudadanos} />}
            {tab === 'paradas' && <TabParadas paradas={paradas} onCompletar={completarParada} completando={completando} reportesCiudadanos={reportesCiudadanos} onResolverReporte={resolverReporte} />}
            {tab === 'novedades' && (
              asignacion && iniciado
                ? <TabNovedades asignacionId={asignacion.id} conductorId={usuario?.id} />
                : <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: '16px', textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(107,114,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="bi bi-lock-fill" style={{ fontSize: '24px', color: '#6b7280' }}></i>
                    </div>
                    <div style={{ color: 'white', fontWeight: 700, fontSize: '16px' }}>Solo disponible en ruta</div>
                    <div style={{ color: '#6b7280', fontSize: '13px', maxWidth: 260 }}>
                      {!asignacion ? 'No tienes una ruta asignada para hoy.' : 'Inicia el recorrido para poder reportar novedades.'}
                    </div>
                  </div>
            )}
          </div>
        )}

        {/* SAFE AREA */}
        <div style={{ height: 'calc(12px + env(safe-area-inset-bottom, 0px))', background: s.bg, flexShrink: 0 }}></div>
        </div>
      </div>

      {/* Modal Justificación Inicio Tardío */}
      {mostrarModalTardio && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#111', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '340px', border: '1px solid #333', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ width: 48, height: 48, borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <i className="bi bi-clock-history" style={{ color: s.amber, fontSize: '24px' }}></i>
            </div>
            <h3 style={{ color: 'white', marginTop: 0, marginBottom: '8px', fontSize: '18px' }}>Inicio fuera de horario</h3>
            <p style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
              Has iniciado la ruta fuera de tu franja horaria asignada. Por favor, ingresa el motivo del retraso para el reporte administrativo.
            </p>
            <textarea 
              rows="3"
              placeholder="Ej: Problemas mecánicos, tráfico pesado, etc." 
              value={justificacionTardio} 
              onChange={e => setJustificacionTardio(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', border: '1px solid #333', background: '#222', color: 'white', marginBottom: '20px', fontSize: '14px', fontFamily: 'inherit', resize: 'none' }} 
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => setMostrarModalTardio(false)} 
                style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #333', color: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button 
                disabled={!justificacionTardio.trim()}
                onClick={() => iniciarRecorrido(justificacionTardio)} 
                style={{ flex: 1, padding: '12px', background: s.amber, border: 'none', color: '#000', borderRadius: '8px', cursor: justificacionTardio.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, opacity: justificacionTardio.trim() ? 1 : 0.5 }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL FINALIZAR RUTA */}
      {mostrarModalFin && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#111', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '340px', border: `1px solid ${s.border}`, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏁</div>
            <h3 style={{ color: '#fff', fontSize: '20px', marginBottom: '8px' }}>¡Ruta Completada!</h3>
            <p style={{ color: s.muted, fontSize: '14px', marginBottom: '20px' }}>
              Has recorrido un total de <span style={{ color: s.green, fontWeight: 700 }}>{kmFinales} KM</span>. 
              Por favor ingresa la carga recolectada para cerrar tu turno.
            </p>

            <div style={{ textAlign: 'left', marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#fff', fontSize: '12px', marginBottom: '8px', fontWeight: 600 }}>TONELADAS RECOLECTADAS</label>
              <input 
                type="number"
                step="0.1"
                placeholder="Ej: 4.5"
                value={toneladas}
                onChange={(e) => setToneladas(e.target.value)}
                style={{ width: '100%', background: '#000', border: `1px solid ${s.border}`, borderRadius: '10px', padding: '14px', color: '#fff', fontSize: '16px' }}
              />
            </div>

            <button 
              onClick={finalizarJornada}
              style={{ width: '100%', padding: '16px', borderRadius: '10px', border: 'none', background: s.green, color: '#000', fontWeight: 800, cursor: 'pointer' }}
            >
              Finalizar y Reportar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
