import { useState, useEffect } from 'react';
import { obtenerReportesCiudadanos, actualizarEstadoReporte, obtenerAsignacionesDisponibles, getAssetUrl } from '../services/api';
import AdminLayout from '../components/Layout/AdminLayout';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const formatearFecha = (fechaStr) => {
  if (!fechaStr) return '';
  const datePart = fechaStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
  }
  return new Date(fechaStr).toLocaleDateString();
};

export default function ReportesAdmin() {
  const [reportes, setReportes] = useState([]);
  const [reporteSeleccionado, setReporteSeleccionado] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [accion, setAccion] = useState(''); // 'aceptar' o 'rechazar'
  const [justificacion, setJustificacion] = useState('');
  const [asignacionId, setAsignacionId] = useState('');
  const [asignaciones, setAsignaciones] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => { cargarReportes(); }, []);

  const cargarReportes = async () => {
    try {
      const res = await obtenerReportesCiudadanos();
      setReportes(res.data.reportes || []);
    } catch (e) { console.error(e); }
    finally { setCargando(false); }
  };

  const handleVerDetalle = async (reporte) => {
    setReporteSeleccionado(reporte);
    // Si vamos a aceptar, necesitamos ver qué rutas hay mañana o en la tarde
    try {
      const res = await obtenerAsignacionesDisponibles();
      setAsignaciones(res.data.asignaciones || []);
    } catch (e) { console.error(e); }
  };

  const handleProcesar = async () => {
    if (accion === 'rechazar' && !justificacion) return alert('Por favor escribe un motivo');
    if (accion === 'aceptar' && !asignacionId) return alert('Selecciona una jornada para la recogida');

    try {
      await actualizarEstadoReporte(reporteSeleccionado.id, {
        estado: accion === 'aceptar' ? 'en_proceso' : 'rechazado',
        justificacion_rechazo: justificacion,
        asignacion_id: asignacionId
      });
      alert(accion === 'aceptar' ? '✅ Reporte aceptado y agendado' : '❌ Reporte rechazado');
      setMostrarModal(false);
      setReporteSeleccionado(null);
      cargarReportes();
    } catch (e) { alert('Error al procesar el reporte'); }
  };

  return (
    <AdminLayout>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', height: 'calc(100vh - 120px)' }}>
        {/* Lado Izquierdo: Lista de Reportes */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'white' }}>📢 Reportes Ciudadanos</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Gestión de solicitudes de la comunidad</p>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {cargando ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>Cargando reportes...</div>
            ) : reportes.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay reportes pendientes ✨</div>
            ) : reportes.map(r => (
              <div 
                key={r.id} 
                className={`card ${reporteSeleccionado?.id === r.id ? 'active' : ''}`}
                style={{ 
                  marginBottom: '10px', 
                  cursor: 'pointer', 
                  border: reporteSeleccionado?.id === r.id ? '1px solid var(--color-primary)' : '1px solid transparent',
                  background: 'rgba(255,255,255,0.02)'
                }}
                onClick={() => handleVerDetalle(r)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--color-primary)', fontWeight: 700 }}>#{r.id} • {new Date(r.created_at).toLocaleDateString()}</span>
                  <span className={`status-badge status-warning`} style={{ fontSize: '9px' }}>PENDIENTE</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '5px' }}>{r.nombre_ciudadano || 'Ciudadano Anónimo'}</div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.descripcion}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Lado Derecho: Detalle y Mapa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {reporteSeleccionado ? (
            <>
              <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                 <div style={{ height: '300px', background: '#000' }}>
                   <MapContainer center={[reporteSeleccionado.latitud, reporteSeleccionado.longitud]} zoom={16} style={{ height: '100%' }}>
                     <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                     <Marker position={[reporteSeleccionado.latitud, reporteSeleccionado.longitud]}>
                        <Popup>Ubicación del reporte</Popup>
                     </Marker>
                   </MapContainer>
                 </div>
                 <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                      {reporteSeleccionado.foto_url && (
                        <img 
                          src={getAssetUrl(reporteSeleccionado.foto_url)} 
                          alt="Evidencia" 
                          style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #333' }}
                        />
                      )}
                      <div>
                        <h4 style={{ fontSize: '16px', color: 'white' }}>Descripción del ciudadano:</h4>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '5px' }}>{reporteSeleccionado.descripcion}</p>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                      <button onClick={() => { setAccion('aceptar'); setMostrarModal(true); }} className="btn btn-primary" style={{ flex: 1 }}>✅ Aceptar Reporte</button>
                      <button onClick={() => { setAccion('rechazar'); setMostrarModal(true); }} className="btn" style={{ flex: 1, background: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', border: '1px solid #ff4444' }}>❌ Rechazar</button>
                    </div>
                 </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div>
                <p style={{ fontSize: '40px' }}>🔍</p>
                <p style={{ color: 'var(--text-muted)' }}>Selecciona un reporte de la lista para ver los detalles y la ubicación.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Acción */}
      {mostrarModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '400px' }}>
            <h3 style={{ marginBottom: '20px' }}>{accion === 'aceptar' ? 'Agendar Recogida' : 'Rechazar Reporte'}</h3>
            
            {accion === 'aceptar' ? (
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Selecciona la Jornada de Recogida</label>
                <select className="card" style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'var(--bg-secondary)', color: 'white' }} value={asignacionId} onChange={e => setAsignacionId(e.target.value)}>
                  <option value="">Selecciona una opción...</option>
                  {asignaciones.map(a => (
                    <option key={a.id} value={a.id}>{a.ruta_nombre} - {a.jornada_nombre} ({formatearFecha(a.fecha)})</option>
                  ))}
                </select>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>💡 El ciudadano podrá ver la actualización del estado desde su portal web.</p>
              </div>
            ) : (
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Motivo del Rechazo</label>
                <textarea 
                  className="card" 
                  style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'var(--bg-secondary)', color: 'white', minHeight: '100px' }}
                  placeholder="Ej: Ya pasó el camión de la ruta fija hoy..."
                  value={justificacion}
                  onChange={e => setJustificacion(e.target.value)}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setMostrarModal(false)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleProcesar}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
