import { useState, useEffect } from 'react';
import { obtenerReportes, actualizarEstadoReporte, obtenerAsignaciones, getAssetUrl } from '../services/api';
import AdminLayout from '../components/Layout/AdminLayout';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function Reportes() {
  const [reportes, setReportes] = useState([]);
  const [reporteSeleccionado, setReporteSeleccionado] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [accion, setAccion] = useState(''); // 'aceptar' o 'rechazar'
  const [justificacion, setJustificacion] = useState('');
  const [asignacionId, setAsignacionId] = useState('');
  const [asignacionesPorFecha, setAsignacionesPorFecha] = useState({});
  const [cargandoAsignaciones, setCargandoAsignaciones] = useState(false);
  const [asignacionesDisponibles, setAsignacionesDisponibles] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => { cargarReportes(); }, []);

  const cargarReportes = async () => {
    try {
      const res = await obtenerReportes();
      setReportes(res.data.reportes || []);
    } catch (e) { console.error(e); }
    finally { setCargando(false); }
  };

  const handleVerDetalle = async (reporte) => {
    setReporteSeleccionado(reporte);
    try {
      const mañana = new Date(); mañana.setDate(mañana.getDate() + 1);
      const pasado = new Date(); pasado.setDate(pasado.getDate() + 2);
      
      const resMañana = await obtenerAsignaciones(mañana.toISOString().split('T')[0]);
      const resPasado = await obtenerAsignaciones(pasado.toISOString().split('T')[0]);
      
      setAsignacionesDisponibles([
        ...(resMañana.data.asignaciones || []),
        ...(resPasado.data.asignaciones || [])
      ]);
    } catch (e) { console.error(e); }
  };

  const handleProcesar = async () => {
    if (accion === 'rechazar' && !justificacion) return alert('Por favor escribe un motivo');
    if (accion === 'aceptar' && !asignacionId) return alert('Selecciona una asignación para la recogida');

    try {
      await actualizarEstadoReporte(reporteSeleccionado.id, {
        estado: accion === 'aceptar' ? 'en_proceso' : 'rechazado',
        justificacion_rechazo: justificacion,
        asignacion_semanal_id: asignacionId // Guarda la ID de la asignación real
      });
      alert(accion === 'aceptar' ? '✅ Reporte aceptado y agendado.' : '❌ Reporte rechazado. Se notificará al ciudadano.');
      setMostrarModal(false);
      setReporteSeleccionado(null);
      cargarReportes();
    } catch (e) { alert('Error al procesar el reporte'); }
  };

  return (
    <AdminLayout>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', height: 'calc(100vh - 120px)' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'white' }}>
              <i className="bi bi-megaphone-fill" style={{ marginRight: '12px', color: 'var(--color-primary)' }}></i>
              Reportes Ciudadanos
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Gestión de solicitudes de la comunidad</p>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {cargando ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>Cargando reportes...</div>
            ) : reportes.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <i className="bi bi-check2-all" style={{ fontSize: '30px', display: 'block', marginBottom: '10px' }}></i>
                No hay reportes pendientes
              </div>
            ) : reportes.map(r => {
              const horas = (new Date() - new Date(r.created_at)) / (1000 * 60 * 60);
              const expirado = r.estado === 'pendiente' && horas > 42;
              let stClass = 'status-warning';
              let stLabel = r.estado?.toUpperCase() || 'PENDIENTE';
              if (expirado) { stClass = 'status-danger'; stLabel = 'EXPIRADO (>42H)'; }
              else if (r.estado === 'en_proceso' || r.estado === 'resuelto') { stClass = 'status-success'; stLabel = 'ACEPTADO / AGENDADO'; }
              else if (r.estado === 'rechazado') { stClass = 'status-danger'; stLabel = 'RECHAZADO'; }

              return (
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
                    <span style={{ fontSize: '10px', color: 'var(--color-primary)', fontWeight: 700 }}>
                      <i className="bi bi-hash"></i>{r.id} • {new Date(r.created_at).toLocaleDateString()}
                    </span>
                    <span className={`status-badge ${stClass}`} style={{ fontSize: '9px' }}>{stLabel}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '5px' }}>{r.nombre_ciudadano || 'Ciudadano Anónimo'} • <span style={{fontSize: '12px', color: 'var(--text-muted)'}}>{r.tipo_problema}</span></div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.descripcion}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {reporteSeleccionado ? (() => {
            const horas = (new Date() - new Date(reporteSeleccionado.created_at)) / (1000 * 60 * 60);
            const expirado = reporteSeleccionado.estado === 'pendiente' && horas > 42;
            const yaProcesado = reporteSeleccionado.estado === 'en_proceso' || reporteSeleccionado.estado === 'rechazado' || reporteSeleccionado.estado === 'resuelto';

            return (
              <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: '300px', background: '#000' }}>
                  <MapContainer center={[reporteSeleccionado.latitud, reporteSeleccionado.longitud]} zoom={16} style={{ height: '100%' }}>
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                    <Marker position={[reporteSeleccionado.latitud, reporteSeleccionado.longitud]}>
                      <Popup>Ubicación del reporte</Popup>
                    </Marker>
                  </MapContainer>
                </div>
                <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                    {reporteSeleccionado.foto_url && (
                      <img 
                        src={getAssetUrl(reporteSeleccionado.foto_url)} 
                        alt="Evidencia" 
                        style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #333' }}
                      />
                    )}
                    <div>
                      <h4 style={{ fontSize: '16px', color: 'white', marginBottom: '4px' }}>{reporteSeleccionado.tipo_problema}</h4>
                      <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{reporteSeleccionado.descripcion}</p>
                      <div style={{ fontSize: '12px', color: 'var(--color-primary)', marginTop: '8px' }}>Reportado por: {reporteSeleccionado.nombre_ciudadano}</div>
                    </div>
                  </div>

                  {reporteSeleccionado.justificacion_rechazo && (
                    <div style={{ padding: '12px', background: reporteSeleccionado.estado === 'rechazado' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 255, 157, 0.1)', border: reporteSeleccionado.estado === 'rechazado' ? '1px solid #EF4444' : '1px solid #00FF9D', borderRadius: '8px', marginBottom: '20px', fontSize: '13px' }}>
                      <strong style={{ color: reporteSeleccionado.estado === 'rechazado' ? '#EF4444' : '#00FF9D' }}>
                        {reporteSeleccionado.estado === 'rechazado' ? 'Motivo de rechazo: ' : 'Detalle de agenda: '}
                      </strong>
                      <span style={{ color: '#fff' }}>{reporteSeleccionado.justificacion_rechazo}</span>
                    </div>
                  )}

                  {expirado && !yaProcesado ? (
                    <div style={{ marginTop: 'auto', padding: '14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', borderRadius: '8px', textAlign: 'center', color: '#EF4444', fontSize: '13px', fontWeight: 600 }}>
                      ⚠️ Este reporte ha expirado al superar el límite de 42 horas sin ser atendido.
                    </div>
                  ) : !yaProcesado ? (
                    <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                      <button onClick={() => { setAccion('aceptar'); setMostrarModal(true); }} className="btn btn-primary" style={{ flex: 1 }}>✅ Aceptar y Agendar</button>
                      <button onClick={() => { setAccion('rechazar'); setMostrarModal(true); }} className="btn" style={{ flex: 1, background: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', border: '1px solid #ff4444' }}>❌ Rechazar</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                      ✓ Este reporte ya fue gestionado.
                    </div>
                  )}
                </div>
              </div>
            );
          })() : (
            <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div>
                <i className="bi bi-search" style={{ fontSize: '40px', color: 'var(--text-muted)', display: 'block', marginBottom: '10px' }}></i>
                <p style={{ color: 'var(--text-muted)' }}>Selecciona un reporte para ver el detalle</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {mostrarModal && (() => {
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="card" style={{ width: '400px' }}>
              <h3 style={{ marginBottom: '20px' }}>{accion === 'aceptar' ? 'Agendar Recogida (Máx 2 días)' : 'Rechazar Reporte'}</h3>
              
              {accion === 'aceptar' ? (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Asignar a Ruta y Fecha</label>
                  <select className="card" style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'var(--bg-secondary)', color: 'white' }} value={asignacionId} onChange={e => setAsignacionId(e.target.value)}>
                    <option value="">Selecciona asignación programada...</option>
                    {asignacionesDisponibles.length === 0 && (
                      <option disabled>No hay rutas programadas para mañana ni pasado</option>
                    )}
                    {asignacionesDisponibles.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.ruta_nombre} — {new Date(a.fecha).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Motivo del Rechazo (Visible para el ciudadano)</label>
                  <textarea 
                    className="card" 
                    style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'var(--bg-secondary)', color: 'white', minHeight: '100px' }}
                    placeholder="Explica de forma clara el motivo por el cual no se realizará la recolección..."
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
        );
      })()}
    </AdminLayout>
  );
}
