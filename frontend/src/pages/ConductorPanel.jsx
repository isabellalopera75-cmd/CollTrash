import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';
import { TabRuta, TabParadas, TabNovedades } from './ConductorTabs';
import { io } from 'socket.io-client';

// Neiva como fallback de posición para el mapa
const NEIVA = [2.9273, -75.2819];
const FAKE_TRAZADO = [[2.927,-75.282],[2.929,-75.283],[2.931,-75.284],[2.933,-75.285],[2.935,-75.284],[2.936,-75.282],[2.937,-75.280],[2.938,-75.278]];

export default function ConductorPanel() {
  const { usuario, cerrarSesion } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('ruta');
  const [asignacion, setAsignacion] = useState(null);
  const [paradas, setParadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [iniciado, setIniciado] = useState(false);
  const [completando, setCompletando] = useState(false);
  const [posicion, setPosicion] = useState(NEIVA);
  const simRef = useRef(null);
  const timerRef = useRef(null);
  const socketRef = useRef(null);
  const [tiempoMin, setTiempoMin] = useState(0);

  useEffect(() => { 
    socketRef.current = io('http://localhost:3000');
    cargar(); 
    return () => { 
      clearInterval(simRef.current); 
      clearInterval(timerRef.current); 
      if (window.emitIntervalRef) clearInterval(window.emitIntervalRef);
      if (socketRef.current) socketRef.current.disconnect();
    }; 
  }, []);

  const cargar = async () => {
    try {
      const hoy = new Date().toISOString().split('T')[0];
      const ra = await API.get(`/conductor/mi-asignacion?fecha=${hoy}`);
      const a = ra.data.asignacion;
      setAsignacion(a);
      if (a) {
        const rp = await API.get(`/conductor/mis-paradas/${a.id}`);
        const pp = rp.data.paradas;
        setParadas(pp);
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

  const iniciarRecorrido = async () => {
    if (iniciado) return;
    setIniciado(true);
    if (asignacion) {
      try { await API.put(`/conductor/asignacion/${asignacion.id}/iniciar`); } catch {}
    }
    // marcar primera parada como en_curso si no lo está
    setParadas(prev => prev.map((p, i) => i === 0 && p.estado === 'pendiente' ? { ...p, estado: 'en_curso' } : p));
    // timer minutos
    timerRef.current = setInterval(() => setTiempoMin(m => m + 1), 60000);
    // simular movimiento GPS en trazado
    const trazado = paradas.reduce((a, p) => { try { if (p.trazado_geom) return [...a, ...JSON.parse(p.trazado_geom)]; } catch {} return a; }, []);
    const pts = trazado.length ? trazado : FAKE_TRAZADO;
    
    // El vehículo se mueve cada 2 segundos para que sea visible y dinámico en la demostración
    const msPorPunto = 2000;
    
    let idx = 0;
    
    // Mover la posición
    simRef.current = setInterval(() => {
      idx++;
      if (idx >= pts.length) {
         idx = 0; // Reiniciar para crear un bucle infinito de demostración
      }
      setPosicion(pts[idx]);
    }, msPorPunto);

    // Emitir la posición actual cada 3 segundos al administrador
    const emitInterval = setInterval(() => {
      if (socketRef.current && asignacion) {
        const currentPos = pts[idx];
        socketRef.current.emit('actualizar_ubicacion', {
          id: asignacion.vehiculo_id,
          cod: asignacion.vehiculo_placa || 'VEH',
          conductor: usuario.nombre,
          lat: currentPos[0],
          lng: currentPos[1],
          ruta: asignacion.ruta_nombre,
          progreso: Math.round((idx / pts.length) * 100),
          sector: 'En Operación',
          estado: 'en_ruta',
          last: '0s'
        });
      }
    }, 3000);

    // Limpiar el emisor al desmontar
    const originalLimpiar = timerRef.current;
    timerRef.current = setInterval(() => setTiempoMin(m => m + 1), 60000);
    // Para simplificar, guardamos el emitInterval en timerRef temporalmente o limpiamos manual
    window.emitIntervalRef = emitInterval;
  };

  const completarParada = async (saId) => {
    if (completando) return;
    setCompletando(true);
    await new Promise(r => setTimeout(r, 1200));
    try {
      if (asignacion) await API.put(`/conductor/parada/${saId}/completar`, { porcentaje_recorrido: 100 });
    } catch {}
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
  const completadas = paradas.filter(p => p.estado === 'completado').length;
  const total = paradas.length;
  const porcentaje = total ? Math.round((completadas / total) * 100) : 0;
  const paradaActual = paradas.find(p => p.estado === 'en_curso');

  const s = { // estilos reutilizables
    bg: '#0a0a0a', card: '#111111', border: '#1f2937',
    green: '#22c55e', amber: '#F59E0B', muted: '#6b7280',
  };

  return (
    <>
      <style>{`
        @keyframes pulsar { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .dot-pulsar { animation: pulsar 1.5s ease-in-out infinite; }
      `}</style>

      <div style={{ height: '100dvh', background: s.bg, display: 'flex', flexDirection: 'column', maxWidth: 430, margin: '0 auto', position: 'relative', fontFamily: 'Inter, sans-serif' }}>

        {/* STATUS BAR */}
        <div style={{ background: '#050505', padding: '6px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              {asignacion?.vehiculo_placa || 'Sin placa'} · {asignacion?.ruta_nombre || 'Sin ruta asignada'}
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
            {/* Botón iniciar flotante (solo si no inició) */}
            {!iniciado && tab === 'ruta' && (
              <div style={{ padding: '12px 16px', background: '#0d0d0d', borderBottom: `1px solid ${s.border}` }}>
                <button onClick={iniciarRecorrido} style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: s.green, color: '#000', fontWeight: 800, fontSize: '15px', cursor: 'pointer' }}>
                  <i className="bi bi-play-fill" style={{ marginRight: '8px' }}></i>Iniciar Recorrido
                </button>
              </div>
            )}

            {tab === 'ruta' && <TabRuta paradas={paradas} posicion={posicion} asignacion={asignacion} />}
            {tab === 'paradas' && <TabParadas paradas={paradas} onCompletar={completarParada} completando={completando} />}
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
        <div style={{ height: 12, background: s.bg, flexShrink: 0 }}></div>
      </div>
    </>
  );
}
