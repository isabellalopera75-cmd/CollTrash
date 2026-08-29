import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import { TabRuta, TabParadas, TabNovedades } from './ConductorTabs';
import { io } from 'socket.io-client';
import './ConductorPanel.css';

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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [alerta, setAlerta] = useState(null);
  const [descargaActiva, setDescargaActiva] = useState(null);
  const [puntosDescarga, setPuntosDescarga] = useState([]);
  const [mostrarModalDescarga, setMostrarModalDescarga] = useState(false);
  const [botaderoSeleccionado, setBotaderoSeleccionado] = useState('');
  const [sectorPausaId, setSectorPausaId] = useState(null);
  const [mostrarModalCompletarDescarga, setMostrarModalCompletarDescarga] = useState(false);
  const [toneladasDescarga, setToneladasDescarga] = useState('');

  // Cargar botaderos activos al montar y descarga activa desde localStorage si existe
  useEffect(() => {
    const fetchPuntos = async () => {
      try {
        const res = await API.get('/puntos-descarga');
        setPuntosDescarga(res.data.puntos || []);
      } catch (err) {
        console.error('Error al cargar puntos de descarga:', err);
      }
    };
    fetchPuntos();
  }, []);

  useEffect(() => {
    const hidratarDescarga = async () => {
      if (!asignacion) return;
      const saved = localStorage.getItem(`colltrash_descarga_activa_${asignacion.id}`);
      if (saved) {
        const descarga = JSON.parse(saved);
        if (descarga && !descarga.latitud_centro) {
          try {
            const res = await API.get(`/conductor/asignacion/${asignacion.id}/descargas/${descarga.id}`);
            if (res.data.descarga) {
              setDescargaActiva(res.data.descarga);
              localStorage.setItem(`colltrash_descarga_activa_${asignacion.id}`, JSON.stringify(res.data.descarga));
              return;
            }
          } catch (err) {
            console.error('Error al hidratar descarga:', err);
          }
        }
        setDescargaActiva(descarga);
      } else {
        setDescargaActiva(null);
      }
    };
    hidratarDescarga();
  }, [asignacion]);

  const sincronizarPendientes = useCallback(async () => {
    const queueStr = localStorage.getItem('colltrash_offline_queue');
    if (!queueStr) return;
    const queue = JSON.parse(queueStr);
    if (queue.length === 0) return;

    let successCount = 0;
    const remainingQueue = [];

    for (const item of queue) {
      try {
        if (item.tipo === 'completar_parada') {
          await API.put(`/conductor/asignacion/${item.asignacion_id}/sector/${item.sector_id}/progreso`, { porcentaje_recorrido: 100 });
        } else if (item.tipo === 'novedad') {
          await API.post('/incidencias', item.payload);
        }
        successCount++;
      } catch (err) {
        remainingQueue.push(item);
      }
    }

    localStorage.setItem('colltrash_offline_queue', JSON.stringify(remainingQueue));
    if (successCount > 0) {
      console.log(`[Offline] Sincronizados ${successCount} eventos pendientes`);
    }
  }, []);

  useEffect(() => { 
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = 'var(--fondo)';

    const socketUrl = window.location.hostname === 'localhost' && window.location.port !== '3000' ? 'http://localhost:3000' : window.location.origin;
    const token = localStorage.getItem('token');
    socketRef.current = io(socketUrl, {
      auth: { token }
    });
    socketRef.current.on('notificacion_nueva', (notificacion) => {
      const tipoAviso = notificacion?.metadata?.tipo;

      // Relevo de emergencia. El servidor guardaba y emitia este aviso, pero
      // aqui se descartaba todo lo que no fuese REPORTE_ASIGNADO: el conductor
      // de reemplazo no se enteraba de que le habian traspasado una ruta ni de
      // donde estaba la contingencia, y solo lo descubria si recargaba el panel.
      if (tipoAviso === 'RELEVO_EMERGENCIA') {
        const { lat, lng } = notificacion.metadata || {};
        const ubicacion = (lat && lng)
          ? `Ubicacion de la contingencia: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
          : 'No se registraron coordenadas de la contingencia.';

        setAlerta({
          titulo: 'RELEVO DE EMERGENCIA',
          mensaje: `${notificacion.mensaje}\n\n${ubicacion}`,
          onAceptar: () => setAlerta(null)
        });
        cargar();
        return;
      }

      if (tipoAviso !== 'REPORTE_ASIGNADO') return;

      setAlerta({
        titulo: 'ATENCIÓN CONDUCTOR',
        mensaje: `${notificacion.mensaje}\n\nRevisa los detalles en la pestaña Sectores.`,
        onAceptar: () => {
          setTab('paradas');
          setAlerta(null);
        }
      });
      cargar(normalizarFecha(notificacion?.metadata?.fecha));
    });

    socketRef.current.on('novedad_atendida', (data) => {
      setAlerta({
        titulo: 'REPORTE ATENDIDO',
        mensaje: data.mensaje || 'Tu reporte ha sido leído y gestionado por el administrador.',
        onAceptar: () => setAlerta(null)
      });
    });
    cargar(); 
    const currentSocket = socketRef.current;
    return () => { 
      clearInterval(simRef.current); 
      clearInterval(timerRef.current); 
      if (window.emitIntervalRef) clearInterval(window.emitIntervalRef);
      if (currentSocket) currentSocket.disconnect();
      document.body.style.backgroundColor = prevBg;
    }; 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      sincronizarPendientes();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sincronizarPendientes]);

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
      let fechas;
      if (fechaObjetivo) {
        fechas = [fechaObjetivo];
      } else if (asignacion && asignacion.fecha) {
        fechas = [asignacion.fecha.split('T')[0]];
      } else {
        fechas = [fechaColombia(0), fechaColombia(1), fechaColombia(2)];
      }
      let ra = null;
      let a = null;

      for (const fecha of fechas) {
        ra = await API.get(`/conductor/mi-asignacion?fecha=${fecha}`);
        a = ra.data.asignacion;
        if (a) break;
      }

      if (!a) {
        if (!mostrarModalFin) {
          setAsignacion(null);
        }
        setParadas([]);
        setReportesCiudadanos([]);
        setRutaRecorrida(false);
        setProgreso(0);
        return;
      }

      if (!mostrarModalFin) {
        setAsignacion(a);
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asignacion]);

  useEffect(() => {
    if (cargando || !asignacion) return;

    const reportesPendientes = reportesCiudadanos.filter(r => r.estado === 'en_proceso');
    if (reportesPendientes.length === 0) return;

    const avisoKey = `${asignacion.id}:${reportesPendientes.map(r => r.id).join(',')}`;
    if (reportesAvisadosRef.current === avisoKey) return;
    reportesAvisadosRef.current = avisoKey;

    setAlerta({
      titulo: 'NUEVOS REPORTES',
      mensaje: `Tienes ${reportesPendientes.length} reporte(s) ciudadano(s) asignado(s) para tener en cuenta durante esta ruta.\n\nRevisa los detalles en la pestaña Sectores.`,
      onAceptar: () => setAlerta(null)
    });
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
        setParadas(prev => prev.map((p, i) => i === 0 && p.estado === 'pendiente' ? { ...p, estado: 'en_curso' } : p));
        timerRef.current = setInterval(() => setTiempoMin(m => m + 1), 60000);

      } catch (e) {
        console.error('❌ ERROR AL INICIAR RUTA:', e.response?.data || e.message);
        const errData = e.response?.data;
        if (errData?.bloqueado || errData?.mensaje) {
          alert(errData.mensaje || 'Error al iniciar la ruta.');
        } else {
          alert('Error de conexión al iniciar ruta.');
        }
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
    if (!asignacion?.id) return alert('No hay una asignación activa para finalizar.');
    try {
      await API.put(`/conductor/asignacion/${asignacion.id}/finalizar`, { toneladas });
      setIniciado(false);
      setMostrarModalFin(false);
      window.location.reload(); 
    } catch (e) {
      console.error('Error al finalizar:', e.response?.data || e.message);
      alert(e.response?.data?.mensaje || 'Ocurrió un error al intentar finalizar la ruta. Por favor intenta de nuevo.');
    }
  };

  const encolarAccionOffline = (item) => {
    const queue = JSON.parse(localStorage.getItem('colltrash_offline_queue') || '[]');
    queue.push(item);
    localStorage.setItem('colltrash_offline_queue', JSON.stringify(queue));
  };

  const reportarNovedad = async (payload) => {
    if (isOnline) {
      try {
        const res = await API.post('/incidencias', payload);
        return { offline: false, ...res.data };
      } catch (e) {
        encolarAccionOffline({ tipo: 'novedad', payload, timestamp: Date.now() });
        return { offline: true };
      }
    } else {
      encolarAccionOffline({ tipo: 'novedad', payload, timestamp: Date.now() });
      return { offline: true };
    }
  };

  const completarParada = async (saId) => {
    if (completando) return;
    setCompletando(true);
    await new Promise(r => setTimeout(r, 600)); 
    try {
      const parada = paradas.find(p => p.id === saId);
      if (asignacion && parada) {
        if (isOnline) {
          try {
            await API.put(`/conductor/asignacion/${asignacion.id}/sector/${parada.sector_id}/progreso`, { porcentaje_recorrido: 100 });
          } catch (e) {
            encolarAccionOffline({ tipo: 'completar_parada', asignacion_id: asignacion.id, sector_id: parada.sector_id, timestamp: Date.now() });
          }
        } else {
          encolarAccionOffline({ tipo: 'completar_parada', asignacion_id: asignacion.id, sector_id: parada.sector_id, timestamp: Date.now() });
        }
      }
    } catch (e) {
      console.error('Error al completar parada:', e);
    }
    await cargar(normalizarFecha(fechaAsignacion));
    setCompletando(false);
  };

  const abrirModalDescarga = (saId) => {
    setSectorPausaId(saId);
    setMostrarModalDescarga(true);
  };

  const confirmarIniciarDescarga = async () => {
    if (!botaderoSeleccionado) return alert("Por favor selecciona un botadero.");
    try {
      const res = await API.post(`/conductor/asignacion/${asignacion.id}/descargas`, {
        sector_asignacion_id: sectorPausaId,
        punto_pausa_lat: posicion[0],
        punto_pausa_lng: posicion[1],
        punto_descarga_id: parseInt(botaderoSeleccionado)
      });
      setDescargaActiva(res.data.descarga);
      localStorage.setItem(`colltrash_descarga_activa_${asignacion.id}`, JSON.stringify(res.data.descarga));
      setMostrarModalDescarga(false);
      setBotaderoSeleccionado('');
      alert("✅ Descarga registrada e inicio de pausa.");
      cargar();
    } catch (e) {
      console.error("Error al registrar descarga:", e.response?.data || e.message);
      alert(e.response?.data?.mensaje || "Error al registrar la descarga.");
    }
  };

  const abrirModalCompletarDescarga = () => {
    setMostrarModalCompletarDescarga(true);
  };

  const confirmarCompletarDescarga = async () => {
    if (!toneladasDescarga || isNaN(toneladasDescarga) || parseFloat(toneladasDescarga) < 0) {
      return alert("Por favor ingresa un número de toneladas válido (mayor o igual a 0).");
    }
    try {
      await API.put(`/conductor/asignacion/${asignacion.id}/descargas/${descargaActiva.id}/completar`, {
        toneladas: parseFloat(toneladasDescarga)
      });
      localStorage.removeItem(`colltrash_descarga_activa_${asignacion.id}`);
      setDescargaActiva(null);
      setMostrarModalCompletarDescarga(false);
      setToneladasDescarga('');
      alert("✅ Descarga completada. Sector reactivado.");
      cargar();
    } catch (e) {
      console.error("Error al completar descarga:", e.response?.data || e.message);
      alert(e.response?.data?.mensaje || "Error al completar la descarga.");
    }
  };

  const total = paradas.length;
  const completadasPorAvance = paradas.filter(p => p.estado === 'completado' || Number(p.porcentaje_recorrido) >= 100).length;
  const completadas = completadasPorAvance;
  const porcentajeParadas = total ? Math.round((completadasPorAvance / total) * 100) : 0;
  const porcentaje = Math.max(porcentajeParadas, Math.round(Number(progreso) || 0));
  const fechaAsignacion = normalizarFecha(asignacion?.fecha);
  const asignacionEsHoy = !fechaAsignacion || fechaAsignacion === fechaColombia(0);
  const puedeCerrarRuta = asignacionEsHoy && iniciado && asignacion?.estado !== 'completada' && rutaRecorrida;
  const reportesPendientesRuta = reportesCiudadanos.filter(r => r.estado === 'en_proceso').length;

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
    const factor = total > 0 ? completadas / total : 1;
    return (totalKm * factor * 1.35).toFixed(1);
  };

  // Paleta del panel. Los valores proceden del sistema de diseño, de modo que
  // el panel comparte identidad con el resto del sistema.
  const s = {
    bg: 'var(--fondo)',
    card: 'var(--superficie)',
    border: 'var(--borde)',
    green: 'var(--marca)',
    amber: 'var(--alerta)',
    muted: 'var(--texto-2)',
  };

  return (
    <>


      <div className="cp-wrapper">
        <div className="cp-container">

        {/* STATUS BAR */}
        <div style={{ background: 'var(--superficie-2)', padding: 'calc(6px + env(safe-area-inset-top, 0px)) 16px 6px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--texto)' }}>
            <span className="dot-pulsar" style={{ width: 7, height: 7, borderRadius: '50%', background: s.green, display: 'inline-block' }}></span>
            {iniciado ? 'En ruta' : 'Listo'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: isOnline ? s.green : 'var(--peligro)' }}>
            <i className={`bi bi-${isOnline ? 'wifi' : 'wifi-off'}`}></i> {isOnline ? 'Conectado' : 'Sin conexión'}
          </div>
        </div>

        {/* HEADER */}
        <div style={{ padding: '12px 16px', background: s.card, borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--marca-suave)', border: '1px solid var(--marca-borde)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="bi bi-truck-front-fill" style={{ color: s.green, fontSize: '18px' }}></i>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--texto)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{usuario?.nombre || 'Conductor'}</div>
            <div style={{ fontSize: '11px', color: s.muted }}>
              {asignacion?.vehiculo_placa || 'Sin placa'} · {asignacion?.ruta_nombre || 'Sin ruta asignada'}{fechaAsignacion && !asignacionEsHoy ? ` · ${fechaAsignacion}` : ''}
            </div>
          </div>
          <button onClick={() => { cerrarSesion(); navigate('/login'); }} style={{ background: 'none', border: 'none', color: s.muted, cursor: 'pointer', fontSize: '18px', padding: '4px' }} title="Cerrar sesión">
            <i className="bi bi-box-arrow-right"></i>
          </button>
        </div>

        {/* PROGRESS BANNER */}
        <div style={{ padding: '12px 16px', background: 'var(--superficie-2)', borderBottom: `1px solid ${s.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--texto)' }}>{completadas}/{total} sectores</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: s.green }}>{porcentaje}%</span>
          </div>
          <div style={{ height: 5, background: 'var(--borde)', borderRadius: 3 }}>
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
          <div onClick={() => setTab('paradas')} style={{ padding: '10px 16px', background: 'var(--peligro-suave)', borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <span className="dot-pulsar" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--peligro)', display: 'inline-block' }}></span>
            <span style={{ fontSize: '11px', color: 'var(--peligro)', fontWeight: 600, flex: 1 }}>
              ⚠️ Tienes {reportesCiudadanos.filter(r => r.estado === 'en_proceso').length} reporte(s) ciudadano(s) pendiente(s) hoy.
            </span>
          </div>
        )}

        {/* INDICADOR DE DESCARGA ACTIVA Y BOTÓN DE NAVEGACIÓN */}
        {descargaActiva && (
          <div style={{ padding: '12px 16px', background: 'var(--alerta-suave)', borderBottom: `1px solid ${s.border}`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="dot-pulsar" style={{ width: 8, height: 8, borderRadius: '50%', background: s.amber, display: 'inline-block' }}></span>
              <span style={{ fontSize: '12px', color: 'var(--alerta)', fontWeight: 600, flex: 1 }}>
                🚛 Trayecto a descarga activo
              </span>
              <button 
                onClick={abrirModalCompletarDescarga}
                style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: s.amber, color: 'var(--marca-contraste)', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}
              >
                Regresar
              </button>
            </div>
            {descargaActiva.latitud_centro && descargaActiva.longitud_centro && (
              <a 
                href={`https://www.google.com/maps/dir/?api=1&destination=${descargaActiva.latitud_centro},${descargaActiva.longitud_centro}&travelmode=driving`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px', 
                  padding: '10px', 
                  borderRadius: '8px', 
                  background: 'var(--info)', 
                  color: 'var(--texto)', 
                  fontWeight: 700, 
                  fontSize: '12px', 
                  textDecoration: 'none',
                  textAlign: 'center',
                  boxShadow: '0 4px 6px -1px var(--info)'
                }}
              >
                <i className="bi bi-geo-alt-fill"></i> Cómo llegar (Google Maps)
              </a>
            )}
          </div>
        )}

        {/* TABS */}
        <div style={{ display: 'flex', background: s.card, borderBottom: `1px solid ${s.border}` }}>
          {[['ruta','bi-map-fill','Ruta'],['paradas','bi-list-check','Sectores'],['novedades','bi-exclamation-triangle-fill','Novedades']].map(([key,icon,label]) => {
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
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--superficie-2)', border: '1px solid var(--borde-fuerte)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="bi bi-calendar-x" style={{ fontSize: '32px', color: 'var(--texto-2)' }}></i>
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--texto)', marginBottom: '8px' }}>Sin ruta asignada hoy</div>
              <div style={{ fontSize: '13px', color: 'var(--texto-2)', lineHeight: 1.6 }}>
                No tienes ninguna ruta programada para el día de hoy.<br />
                Consulta con el administrador si crees que es un error.
              </div>
            </div>
            <button
              onClick={() => { cerrarSesion(); navigate('/login'); }}
              style={{ padding: '12px 28px', borderRadius: '10px', border: '1px solid var(--borde-fuerte)', background: 'transparent', color: 'var(--texto-3)', fontWeight: 600, cursor: 'pointer', fontSize: '14px', marginTop: '8px' }}
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
                    <div style={{ padding: '12px 16px', background: 'var(--alerta-suave)', borderBottom: `1px solid ${s.border}`, textAlign: 'center' }}>
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
                    <div style={{ padding: '12px 16px', background: 'var(--peligro-suave)', borderBottom: `1px solid ${s.border}`, textAlign: 'center' }}>
                      <span style={{ color: 'var(--peligro)', fontSize: '13px', fontWeight: 700 }}>
                        <i className="bi bi-exclamation-octagon-fill" style={{ marginRight: '8px' }}></i>
                        JORNADA EXPIRADA (Finalizó {asignacion?.hora_limite_fin?.substring(0, 5)})
                      </span>
                    </div>
                  );
                }

                return (
                  <div style={{ padding: '12px 16px', background: 'var(--superficie-2)', borderBottom: `1px solid ${s.border}` }}>
                    <button onClick={() => iniciarRecorrido()} style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: s.green, color: 'var(--marca-contraste)', fontWeight: 800, fontSize: '15px', cursor: 'pointer' }}>
                      <i className="bi bi-play-fill" style={{ marginRight: '8px' }}></i>Iniciar Recorrido
                    </button>
                  </div>
                );
              })()
            )}

            {/* Botón finalizar ruta (solo si llegó al 100%) */}
            {puedeCerrarRuta && tab === 'ruta' && (
              <div style={{ padding: '12px 16px', background: 'var(--superficie-2)', borderBottom: `1px solid ${s.border}` }}>
                <button onClick={() => {
                  // Si el backend no envió km via socket, calcular localmente
                  if (!kmFinales || kmFinales === 0) setKmFinales(parseFloat(calcularKmEstimados()));
                  setMostrarModalFin(true);
                }} style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: s.amber, color: 'var(--marca-contraste)', fontWeight: 800, fontSize: '15px', cursor: 'pointer', animation: 'pulsar 2s infinite' }}>
                  <i className="bi bi-check2-circle" style={{ marginRight: '8px' }}></i>Finalizar Ruta
                </button>
              </div>
            )}

            {tab === 'ruta' && <TabRuta paradas={paradas} posicion={posicion} asignacion={asignacion} reportesCiudadanos={reportesCiudadanos} />}
            {tab === 'paradas' && (
              <TabParadas 
                paradas={paradas} 
                onCompletar={completarParada} 
                completando={completando} 
                reportesCiudadanos={reportesCiudadanos} 
                onResolverReporte={resolverReporte} 
                iniciarDescarga={abrirModalDescarga}
                completarDescarga={abrirModalCompletarDescarga}
                descargaActiva={descargaActiva}
              />
            )}
            {tab === 'novedades' && (
              asignacion && iniciado
                ? <TabNovedades asignacionId={asignacion.id} conductorId={usuario?.id} onReportarNovedad={reportarNovedad} isOnline={isOnline} />
                : <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: '16px', textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--superficie-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="bi bi-lock-fill" style={{ fontSize: '24px', color: 'var(--texto-2)' }}></i>
                    </div>
                    <div style={{ color: 'var(--texto)', fontWeight: 700, fontSize: '16px' }}>Solo disponible en ruta</div>
                    <div style={{ color: 'var(--texto-2)', fontSize: '13px', maxWidth: 260 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23, 30, 23, .55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'var(--superficie)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '340px', border: '1px solid var(--borde)', boxShadow: '0 20px 25px -5px rgba(23, 30, 23, .45)' }}>
            <div style={{ width: 48, height: 48, borderRadius: '12px', background: 'var(--alerta-suave)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <i className="bi bi-clock-history" style={{ color: s.amber, fontSize: '24px' }}></i>
            </div>
            <h3 style={{ color: 'var(--texto)', marginTop: 0, marginBottom: '8px', fontSize: '18px' }}>Inicio fuera de horario</h3>
            <p style={{ color: 'var(--texto-3)', fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
              Has iniciado la ruta fuera de tu franja horaria asignada. Por favor, ingresa el motivo del retraso para el reporte administrativo.
            </p>
            <textarea 
              rows="3"
              placeholder="Ej: Problemas mecánicos, tráfico pesado, etc." 
              value={justificacionTardio} 
              onChange={e => setJustificacionTardio(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', border: '1px solid var(--borde)', background: 'var(--superficie-2)', color: 'var(--texto)', marginBottom: '20px', fontSize: '14px', fontFamily: 'inherit', resize: 'none' }} 
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => setMostrarModalTardio(false)} 
                style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--borde)', color: 'var(--texto)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button 
                disabled={!justificacionTardio.trim()}
                onClick={() => iniciarRecorrido(justificacionTardio)} 
                style={{ flex: 1, padding: '12px', background: s.amber, border: 'none', color: 'var(--marca-contraste)', borderRadius: '8px', cursor: justificacionTardio.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, opacity: justificacionTardio.trim() ? 1 : 0.5 }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL FINALIZAR RUTA */}
      {mostrarModalFin && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(23, 30, 23, .55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--superficie)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '340px', border: `1px solid ${s.border}`, boxShadow: '0 20px 25px -5px rgba(23, 30, 23, .45)', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏁</div>
            <h3 style={{ color: 'var(--texto)', fontSize: '20px', marginBottom: '8px' }}>¡Ruta Completada!</h3>
            <p style={{ color: s.muted, fontSize: '14px', marginBottom: '20px' }}>
              Has recorrido un total de <span style={{ color: s.green, fontWeight: 700 }}>{kmFinales} KM</span>. 
              Por favor ingresa la carga recolectada para cerrar tu turno.
            </p>

            <div style={{ textAlign: 'left', marginBottom: '20px' }}>
              <label style={{ display: 'block', color: 'var(--texto)', fontSize: '12px', marginBottom: '8px', fontWeight: 600 }}>TONELADAS RECOLECTADAS</label>
              <input 
                type="number"
                step="0.1"
                placeholder="Ej: 4.5"
                value={toneladas}
                onChange={(e) => setToneladas(e.target.value)}
                style={{ width: '100%', background: 'var(--superficie)', border: `1px solid ${s.border}`, borderRadius: '10px', padding: '14px', color: 'var(--texto)', fontSize: '16px' }}
              />
            </div>

            <button 
              onClick={finalizarJornada}
              style={{ width: '100%', padding: '16px', borderRadius: '10px', border: 'none', background: s.green, color: 'var(--marca-contraste)', fontWeight: 800, cursor: 'pointer' }}
            >
              Finalizar y Reportar
            </button>
          </div>
        </div>
      )}
      
      {/* MODAL ALERTA PERSONALIZADA */}
      {alerta && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23, 30, 23, .55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'var(--superficie)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '340px', border: '1px solid var(--borde)', boxShadow: '0 20px 25px -5px rgba(23, 30, 23, .45)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '12px', background: 'var(--alerta-suave)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', margin: '0 auto' }}>
              <i className="bi bi-bell-fill" style={{ color: s.amber, fontSize: '24px' }}></i>
            </div>
            <h3 style={{ color: 'var(--texto)', marginTop: 0, marginBottom: '12px', fontSize: '18px' }}>{alerta.titulo}</h3>
            <p style={{ color: 'var(--texto-3)', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {alerta.mensaje}
            </p>
            <button 
              onClick={alerta.onAceptar}
              style={{ width: '100%', padding: '14px', background: s.green, border: 'none', color: 'var(--marca-contraste)', borderRadius: '10px', cursor: 'pointer', fontWeight: 800, fontSize: '15px' }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal Iniciar Pausa de Descarga */}
      {mostrarModalDescarga && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23, 30, 23, .55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'var(--superficie)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '340px', border: '1px solid var(--borde)', boxShadow: '0 20px 25px -5px rgba(23, 30, 23, .45)', textAlign: 'center' }}>
            <h3 style={{ color: 'var(--texto)', marginTop: 0, marginBottom: '16px', fontSize: '18px' }}>Ir a Descarga</h3>
            <p style={{ color: 'var(--texto-3)', fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
              Selecciona el botadero o estación autorizada a la que te diriges para descargar el camión:
            </p>
            <select
              value={botaderoSeleccionado}
              onChange={e => setBotaderoSeleccionado(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '10px', border: '1px solid var(--borde)', background: 'var(--superficie-2)', color: 'var(--texto)', marginBottom: '24px', fontSize: '14px' }}
            >
              <option value="">-- Seleccionar botadero --</option>
              {puntosDescarga.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.tipo === 'relleno' ? 'Relleno' : 'Estación'})</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setMostrarModalDescarga(false); setBotaderoSeleccionado(''); }}
                style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--borde)', color: 'var(--texto)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                disabled={!botaderoSeleccionado}
                onClick={confirmarIniciarDescarga}
                style={{ flex: 1, padding: '12px', background: s.amber, border: 'none', color: 'var(--marca-contraste)', borderRadius: '10px', cursor: botaderoSeleccionado ? 'pointer' : 'not-allowed', fontWeight: 700, opacity: botaderoSeleccionado ? 1 : 0.5 }}
              >
                Iniciar Pausa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Completar Descarga (Retorno) */}
      {mostrarModalCompletarDescarga && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(23, 30, 23, .55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'var(--superficie)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '340px', border: '1px solid var(--borde)', boxShadow: '0 20px 25px -5px rgba(23, 30, 23, .45)', textAlign: 'center' }}>
            <h3 style={{ color: 'var(--texto)', marginTop: 0, marginBottom: '16px', fontSize: '18px' }}>Regresar de Descarga</h3>
            <p style={{ color: 'var(--texto-3)', fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
              Por favor, ingresa el tonelaje descargado en el botadero para completar el registro de descarga:
            </p>
            <div style={{ textAlign: 'left', marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--texto)', fontSize: '11px', marginBottom: '8px', fontWeight: 600 }}>TONELADAS DESCARGADAS</label>
              <input
                type="number"
                step="0.01"
                placeholder="Ej: 2.35"
                value={toneladasDescarga}
                onChange={e => setToneladasDescarga(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--superficie)', border: '1px solid var(--borde)', borderRadius: '10px', padding: '12px', color: 'var(--texto)', fontSize: '15px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setMostrarModalCompletarDescarga(false); setToneladasDescarga(''); }}
                style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--borde)', color: 'var(--texto)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                disabled={!toneladasDescarga}
                onClick={confirmarCompletarDescarga}
                style={{ flex: 1, padding: '12px', background: s.green, border: 'none', color: 'var(--marca-contraste)', borderRadius: '10px', cursor: toneladasDescarga ? 'pointer' : 'not-allowed', fontWeight: 700 }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
