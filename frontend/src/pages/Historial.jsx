import { useState, useEffect } from 'react';
import AdminLayout from '../components/Layout/AdminLayout';
import { obtenerHistorial, obtenerNovedadesOperativas } from '../services/api';

export default function Historial() {
  const [activeTab, setActiveTab] = useState('auditoria');
  const [logs, setLogs] = useState([]);
  const [novedades, setNovedades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeTab === 'auditoria') cargarHistorial();
    else cargarNovedades();
  }, [activeTab]);

  const cargarHistorial = async () => {
    setLoading(true);
    try {
      const res = await obtenerHistorial();
      setLogs(res.data.historial || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const cargarNovedades = async () => {
    setLoading(true);
    try {
      const res = await obtenerNovedadesOperativas();
      setNovedades(res.data.novedades || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (accion) => {
    if (accion.includes('Ruta')) return <i className="bi bi-map-fill"></i>;
    if (accion.includes('Conductor')) return <i className="bi bi-person-badge-fill"></i>;
    if (accion.includes('Vehículo')) return <i className="bi bi-truck"></i>;
    if (accion.includes('Configuración')) return <i className="bi bi-gear-fill"></i>;
    return <i className="bi bi-activity"></i>;
  };

  const getColor = (accion) => {
    if (accion.includes('Creación') || accion.includes('Registro') || accion.includes('Restauración')) return 'var(--color-primary)';
    if (accion.includes('Eliminación')) return '#ff4d4d';
    if (accion.includes('Edición') || accion.includes('Actualización')) return '#ffcc00';
    return '#888';
  };

  const s = {
    tab: (active) => ({
      padding: '12px 24px',
      cursor: 'pointer',
      borderBottom: `2px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
      color: active ? 'white' : 'var(--text-muted)',
      fontWeight: active ? 600 : 400,
      transition: 'all 0.3s ease',
      fontSize: '14px'
    }),
    th: { padding: '15px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'left' },
    td: { padding: '15px 20px', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>
          Centro de Historial y Auditoría
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Seguimiento detallado de todas las acciones del sistema</p>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={s.tab(activeTab === 'auditoria')} onClick={() => setActiveTab('auditoria')}>
          <i className="bi bi-shield-check" style={{ marginRight: '8px' }}></i> Auditoría de Sistema
        </div>
        <div style={s.tab(activeTab === 'novedades')} onClick={() => setActiveTab('novedades')}>
          <i className="bi bi-journal-text" style={{ marginRight: '8px' }}></i> Bitácora de Novedades
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {activeTab === 'auditoria' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
              <tr>
                <th style={s.th}>Acción</th>
                <th style={s.th}>Detalle del Cambio</th>
                <th style={s.th}>Responsable</th>
                <th style={s.th}>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center' }}>Cargando actividad...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center' }}>No hay registros aún.</td></tr>
              ) : logs.map(log => (
                <tr key={log.id}>
                  <td style={s.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                       <span style={{ color: getColor(log.accion) }}>{getIcon(log.accion)}</span>
                       <span style={{ fontWeight: 600 }}>{log.accion}</span>
                    </div>
                  </td>
                  <td style={{ ...s.td, color: '#ccc' }}>{log.detalles}</td>
                  <td style={s.td}>
                    <div style={{ fontWeight: 500 }}>{log.usuario_nombre || 'Sistema'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{log.usuario_email}</div>
                  </td>
                  <td style={{ ...s.td, fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(log.fecha).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
              <tr>
                <th style={s.th}>Evento</th>
                <th style={s.th}>Justificación / Motivo</th>
                <th style={s.th}>Autorizado Por</th>
                <th style={s.th}>Fecha Evento</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center' }}>Cargando novedades...</td></tr>
              ) : novedades.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center' }}>No hay novedades registradas.</td></tr>
              ) : novedades.map(n => (
                <tr key={n.id}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600, color: 'var(--color-warning)' }}>
                      <i className="bi bi-lightning-fill" style={{ marginRight: '8px' }}></i>
                      {n.tipo_novedad === 'REACTIVACION_MANUAL' ? 'Reactivación de Inicio' : n.tipo_novedad}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ruta: {n.ruta_nombre}</div>
                  </td>
                  <td style={{ ...s.td, color: '#eee' }}>{n.descripcion}</td>
                  <td style={s.td}>
                    <div style={{ fontWeight: 500 }}>{n.admin_nombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Administrador</div>
                  </td>
                  <td style={{ ...s.td, fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(n.fecha).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}
