import React, { useEffect, useRef, useState, Component } from 'react';
import { MapContainer, Marker, CircleMarker, Popup } from 'react-leaflet';
import MapaOscuro from '../components/MapaOscuro';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import AdminLayout from '../components/Layout/AdminLayout';
import { io } from 'socket.io-client';
import API from '../services/api';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: 'black', color: 'white', minHeight: '100vh' }}>
          <h2>Algo salió mal en Monitoreo.jsx.</h2>
          <pre style={{ color: 'red', whiteSpace: 'pre-wrap' }}>{this.state.error && this.state.error.toString()}</pre>
          <pre style={{ color: 'yellow', whiteSpace: 'pre-wrap' }}>{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function MonitoreoContent() {
  const socketRef = useRef(null);
  const [vehiculos, setVehiculos] = useState([]);
  const [incidencias, setIncidencias] = useState([]);

  const [incidenciaSeleccionada, setIncidenciaSeleccionada] = useState(null);
  const [resolucionForm, setResolucionForm] = useState({ resolucion: '', nuevo_conductor_id: '', nuevo_vehiculo_id: '', eta_minutos: '' });
  const [telefonos, setTelefonos] = useState({ telefono_grua: '', telefono_ambulancia: '' });
  const [recursosLibres, setRecursosLibres] = useState({ conductores: [], vehiculos: [] });
  const [cargandoRecursos, setCargandoRecursos] = useState(false);

  const fetchIncidencias = async () => {
    try {
      const res = await API.get('/incidencias');
      if (res.data?.incidencias) {
        const descartadas = JSON.parse(localStorage.getItem('colltrash_incidencias_descartadas') || '[]');
        const idsBackend = res.data.incidencias.map(i => i.id);
        const descartadasLimpias = descartadas.filter(id => idsBackend.includes(id));
        localStorage.setItem('colltrash_incidencias_descartadas', JSON.stringify(descartadasLimpias));

        setIncidencias(res.data.incidencias.filter(i => !descartadasLimpias.includes(i.id)));
      }
    } catch (error) {
      console.error("Error cargando incidencias:", error);
    }
  };

  const handleAbrirModalResolucion = async (incidencia) => {
    setIncidenciaSeleccionada(incidencia);
    setResolucionForm({ resolucion: '', nuevo_conductor_id: '', nuevo_vehiculo_id: '', eta_minutos: '' });
    
    if (incidencia.tipo === 'operario_lesionado' || incidencia.tipo === 'falla_motor' || incidencia.tipo === 'accidente') {
      try {
        const resTel = await API.get('/config/telefonos');
        setTelefonos(resTel.data.telefonos);
      } catch (e) { console.error('Error cargando teléfonos', e); }
    }

    if (incidencia.tipo === 'falla_motor' || incidencia.tipo === 'accidente') {
      setCargandoRecursos(true);
      try {
        const resRec = await API.get('/rutas/recursos-libres');
        setRecursosLibres(resRec.data);
      } catch (e) { console.error('Error cargando recursos', e); }
      finally { setCargandoRecursos(false); }
    }
  };

  const submitResolucion = async (e) => {
    e.preventDefault();
    try {
      await API.put(`/incidencias/${incidenciaSeleccionada.id}/resolver`, resolucionForm);
      const resueltaId = incidenciaSeleccionada.id;
      setIncidenciaSeleccionada(null);
      setIncidencias(prev => prev.filter(i => i.id !== resueltaId));
      
      const descartadas = JSON.parse(localStorage.getItem('colltrash_incidencias_descartadas') || '[]');
      localStorage.setItem('colltrash_incidencias_descartadas', JSON.stringify(descartadas.filter(id => id !== resueltaId)));
    } catch(err) {
      alert('Error al resolver la incidencia. Verifica los campos.');
    }
  };

  const descartarVisualmente = (id) => {
    setIncidencias(prev => prev.filter(i => i.id !== id));
    const descartadas = JSON.parse(localStorage.getItem('colltrash_incidencias_descartadas') || '[]');
    if (!descartadas.includes(id)) {
      localStorage.setItem('colltrash_incidencias_descartadas', JSON.stringify([...descartadas, id]));
    }
  };

  useEffect(() => {
    fetchIncidencias();

    // Auto-open modal if navigated from Toast
    const params = new URLSearchParams(window.location.search);
    const incidencia_id = params.get('incidencia_id');
    
    if (incidencia_id) {
      // Usamos setTimeout para asegurar que las incidencias ya se cargaron del API,
      // O lo hacemos dentro del then de fetchIncidencias.
      // Mejor lo manejamos en otro useEffect que observe `incidencias`.
    }

    const socketUrl = window.location.hostname === 'localhost' && window.location.port !== '3000' ? 'http://localhost:3000' : window.location.origin;
    const token = localStorage.getItem('token');
    socketRef.current = io(socketUrl, {
      auth: { token }
    });

    // Se conserva la instancia en una variable local para que la limpieza
    // desconecte siempre este socket y no lo que la ref contenga más adelante.
    const socket = socketRef.current;

    socketRef.current.on('ubicacion_vehiculo', (data) => {
      setVehiculos(prev => {
        const existe = prev.find(v => v.id === data.id);
        if (existe) {
          return prev.map(v => v.id === data.id ? { ...v, ...data, last: '0s' } : v);
        }
        return [...prev, data];
      });
    });



    socketRef.current.on('ruta_finalizada', (data) => {
      setVehiculos(prev => prev.filter(v => v.asignacion_id !== data.asignacion_id));
    });

    socketRef.current.on('nueva_incidencia', (incidencia) => {
      setIncidencias(prev => [incidencia, ...prev.filter(i => i.id !== incidencia.id)]);
    });

    socketRef.current.on('incidencia_resuelta', (incidencia_id) => {
      setIncidencias(prev => prev.filter(i => i.id !== incidencia_id));
      const descartadas = JSON.parse(localStorage.getItem('colltrash_incidencias_descartadas') || '[]');
      localStorage.setItem('colltrash_incidencias_descartadas', JSON.stringify(descartadas.filter(id => id !== incidencia_id)));
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incidencia_id = params.get('incidencia_id');
    
    if (incidencia_id && incidencias.length > 0) {
      const found = incidencias.find(i => i.id.toString() === incidencia_id);
      if (found) {
        handleAbrirModalResolucion(found);
        window.history.replaceState(null, '', '/monitoreo');
      }
    }
  }, [incidencias]);

  const getStatusColor = (status) => {
    if (status === 'en_ruta') return 'var(--color-primary)';
    if (status === 'en_descarga' || status === 'descargando') return 'var(--color-accent)';
    if (status === 'regresando_a_ruta') return 'var(--color-warning)';
    if (status === 'en_incidencia' || status === 'incidente') return 'var(--color-danger)';
    return 'var(--text-muted)';
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Monitoreo en Vivo</h2>
           <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Posición en tiempo real de todos los vehículos activos</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
           <div className="status-badge status-active">
             <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-primary)' }}></div>
             En vivo
           </div>
           <div style={{ color: 'var(--text-muted)', fontSize: '13px', textTransform: 'capitalize' }}>
             <i className="bi bi-calendar3" style={{ marginRight: '8px' }}></i>
             {new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
           </div>
        </div>
      </div>

      <div className="split-view">
        {/* Vehicles List Pane */}
        <div className="list-pane" style={{ width: '340px' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
             <h4 style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '8px' }}>Vehículos Activos</h4>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-primary)', fontWeight: 600 }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animate: 'pulse' }}></div>
                {vehiculos.length} en operación
             </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {vehiculos.map((v) => (
              <div key={v.id} className="list-item" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                   <div style={{ display: 'flex', gap: '12px' }}>
                      <div className="logo-circle" style={{ width: '32px', height: '32px', background: 'var(--bg-secondary)', color: getStatusColor(v.estado), fontSize: '14px' }}>🚚</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{v.cod}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v.conductor}</div>
                      </div>
                   </div>
                   <span className="status-badge" style={{ fontSize: '8px', border: 'none', background: 'color-mix(in oklch, ' + getStatusColor(v.estado) + ', transparent 90%)', color: getStatusColor(v.estado) }}>
                      ● {v.estado === 'en_descarga' ? v.sector.toUpperCase() : v.estado === 'regresando_a_ruta' ? 'REGRESANDO A RUTA' : v.estado.replace('_', ' ').toUpperCase()}
                   </span>
                </div>

                <div style={{ marginBottom: '12px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      <span>{v.ruta}</span>
                      <span>{v.progreso}%</span>
                   </div>
                   <div className="progress-container">
                      <div className="progress-fill" style={{ width: v.progreso + '%', background: getStatusColor(v.estado) }}></div>
                   </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                   <span>Sector {v.sector}</span>
                   <span>hace {v.last}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Map Pane */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer center={[2.9273, -75.2819]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <MapaOscuro />
            {vehiculos.map(v => (
              <CircleMarker 
                key={v.id} 
                center={[v.lat, v.lng]} 
                radius={12} 
                pathOptions={{ color: getStatusColor(v.estado), fillColor: getStatusColor(v.estado), fillOpacity: 0.8 }}
              >
                 <Popup>
                   <div style={{ color: '#111', fontSize: '12px', padding: '4px' }}>
                     <strong style={{ fontSize: '13px' }}>{v.cod}</strong> ({v.conductor})<br />
                     <span style={{ color: getStatusColor(v.estado), fontWeight: 'bold' }}>
                       ● {v.estado === 'en_descarga' ? v.sector : v.estado === 'regresando_a_ruta' ? 'Regresando a ruta' : v.estado.replace('_', ' ')}
                     </span><br />
                     <span>Progreso: {v.progreso}%</span><br />
                     <span>Distancia: {v.km_recorridos} KM</span>
                   </div>
                 </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          {/* Map Overlays */}
          <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 1000 }}>
             <div className="card" style={{ padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '13px' }}>Neiva, Huila</span>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Vista operacional</div>
             </div>
          </div>



          <div style={{ position: 'absolute', bottom: '20px', left: '20px', zIndex: 1000 }}>
             <div className="card" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                {['En ruta', 'Descargando', 'Incidente', 'Tardío'].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: i===3?0:'8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: i===0?'var(--color-primary)':(i===1?'var(--color-accent)':(i===2?'var(--color-danger)':'var(--color-warning)')) }}></div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s}</span>
                  </div>
                ))}
             </div>
          </div>
        </div>
      </div>

      {/* Modal Dinámico de Resolución */}
      {incidenciaSeleccionada && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div className="card" style={{ width: '450px', border: '1px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', color: 'var(--texto)', textTransform: 'capitalize' }}>
                Gestionar: {incidenciaSeleccionada.tipo.replace('_', ' ')}
              </h3>
              <button onClick={() => setIncidenciaSeleccionada(null)} style={{ background: 'none', border: 'none', color: 'var(--texto)', cursor: 'pointer' }}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <form onSubmit={submitResolucion} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* CASO 1: operario_lesionado */}
              {incidenciaSeleccionada.tipo === 'operario_lesionado' && (
                <>
                  <div style={{ background: 'var(--peligro-suave)', border: '1px solid var(--peligro)', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                    <i className="bi bi-telephone-outbound-fill" style={{ fontSize: '24px', color: 'var(--peligro)' }}></i>
                    <h4 style={{ color: 'var(--peligro)', margin: '10px 0 5px' }}>Ambulancia: {telefonos.telefono_ambulancia || 'Cargando...'}</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Contacta a emergencias inmediatamente. No cierres este panel hasta haber despachado ayuda.</p>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ background: 'var(--peligro)', border: 'none', width: '100%', padding: '12px', fontWeight: 'bold' }}>
                    Marcar como Ambulancia Gestionada
                  </button>
                </>
              )}

              {/* CASO 2: falla_motor o accidente */}
              {(incidenciaSeleccionada.tipo === 'falla_motor' || incidenciaSeleccionada.tipo === 'accidente') && (
                <>
                  <div style={{ background: 'var(--alerta-suave)', border: '1px solid var(--alerta)', padding: '12px', borderRadius: '8px', textAlign: 'center', marginBottom: '8px' }}>
                    <i className="bi bi-truck" style={{ fontSize: '20px', color: 'var(--alerta)' }}></i>
                    <h4 style={{ color: 'var(--alerta)', margin: '5px 0' }}>Grúa de Rescate: {telefonos.telefono_grua || 'Cargando...'}</h4>
                  </div>

                  {cargandoRecursos ? <p style={{ fontSize: '12px', textAlign: 'center' }}>Buscando personal y vehículos libres...</p> : (
                    <>
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>1. Conductor de Relevo</label>
                        <select required value={resolucionForm.nuevo_conductor_id} onChange={e => setResolucionForm({...resolucionForm, nuevo_conductor_id: e.target.value})} className="card" style={{ width: '100%', padding: '10px', marginTop: '4px', background: 'var(--bg-secondary)', border: 'none', color: 'var(--texto)' }}>
                          <option value="">Selecciona conductor libre...</option>
                          {recursosLibres.conductores
                            .filter(c => c.id !== incidenciaSeleccionada.conductor_id)
                            .map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>2. Vehículo de Reemplazo</label>
                        <select required value={resolucionForm.nuevo_vehiculo_id} onChange={e => setResolucionForm({...resolucionForm, nuevo_vehiculo_id: e.target.value})} className="card" style={{ width: '100%', padding: '10px', marginTop: '4px', background: 'var(--bg-secondary)', border: 'none', color: 'var(--texto)' }}>
                          <option value="">Selecciona vehículo libre...</option>
                          {recursosLibres.vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa} ({v.capacidad_ton} Ton)</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>3. ETA Estimado de Rescate (Minutos)</label>
                        <input required type="number" value={resolucionForm.eta_minutos} onChange={e => setResolucionForm({...resolucionForm, eta_minutos: e.target.value})} className="card" style={{ width: '100%', padding: '10px', marginTop: '4px', background: 'var(--bg-secondary)', border: 'none', color: 'var(--texto)' }} placeholder="Ej: 15" />
                      </div>
                    </>
                  )}
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '10px', fontWeight: 'bold' }}>
                    Asignar Relevo y Cerrar Incidencia
                  </button>
                </>
              )}

              {/* CASO 3: via_obstruida u otro */}
              {incidenciaSeleccionada.tipo !== 'operario_lesionado' && incidenciaSeleccionada.tipo !== 'falla_motor' && incidenciaSeleccionada.tipo !== 'accidente' && (
                <>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Nota de Resolución (Opcional)</label>
                    <textarea value={resolucionForm.resolucion} onChange={e => setResolucionForm({...resolucionForm, resolucion: e.target.value})} className="card" style={{ width: '100%', padding: '10px', marginTop: '4px', minHeight: '80px', background: 'var(--bg-secondary)', border: 'none', color: 'var(--texto)' }} placeholder="Ej: Se le indicó al conductor tomar la calle alterna..." />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontWeight: 'bold' }}>
                    Cerrar Incidencia
                  </button>
                </>
              )}

            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default function Monitoreo() {
  return (
    <ErrorBoundary>
      <MonitoreoContent />
    </ErrorBoundary>
  );
}
