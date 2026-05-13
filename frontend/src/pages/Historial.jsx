import { useState, useEffect } from 'react';
import AdminLayout from '../components/Layout/AdminLayout';
import { obtenerHistorial } from '../services/api';

export default function Historial() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarHistorial();
  }, []);

  const cargarHistorial = async () => {
    try {
      const res = await obtenerHistorial();
      setLogs(res.data.historial);
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

  return (
    <AdminLayout>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>
          <i className="bi bi-clock-history" style={{ marginRight: '12px', color: 'var(--color-primary)' }}></i>
          Historial de Actividad
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Auditoría directa de todos los cambios en el sistema</p>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#eee' }}>
          <thead style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
            <tr>
              <th style={{ padding: '15px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '220px' }}>Acción</th>
              <th style={{ padding: '15px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Descripción del Cambio</th>
              <th style={{ padding: '15px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '200px' }}>Responsable</th>
              <th style={{ padding: '15px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '180px' }}>Fecha y Hora</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center' }}>Cargando actividad...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center' }}>No hay registros aún.</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '15px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        width: '32px', height: '32px', borderRadius: '8px', 
                        background: `rgba(${getColor(log.accion) === 'var(--color-primary)' ? '0, 255, 157' : '255, 255, 255'}, 0.1)`, 
                        color: getColor(log.accion),
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {getIcon(log.accion)}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{log.accion}</span>
                    </div>
                  </td>
                  <td style={{ padding: '15px 20px', fontSize: '14px', color: '#eee', lineHeight: '1.4' }}>
                    {log.detalles}
                  </td>
                  <td style={{ padding: '15px 20px' }}>
                    <div style={{ fontSize: '13px', color: 'white', fontWeight: 500 }}>{log.usuario_nombre || 'Sistema'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{log.usuario_email}</div>
                  </td>
                  <td style={{ padding: '15px 20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(log.fecha).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
