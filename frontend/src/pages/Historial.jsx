import React, { useState, useEffect, useRef } from 'react';
import AdminLayout from '../components/Layout/AdminLayout';
import { obtenerHistorial, obtenerNovedadesOperativas } from '../services/api';
import API from '../services/api';
import { iconoNotificacion, colorNotificacion, tituloNotificacion } from '../utils/notificaciones';

export default function Historial() {
  const [logs, setLogs] = useState([]);
  const [novedades, setNovedades] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  
  const queryParams = new URLSearchParams(window.location.search);
  const initialTab = queryParams.get('tab') || 'auditoria';
  const targetNotiId = queryParams.get('noti_id');
  
  const [activeTab, setActiveTab] = useState(initialTab === 'notificaciones' ? 'notificaciones' : (initialTab === 'novedades' ? 'novedades' : 'auditoria'));
  const [loading, setLoading] = useState(true);
  // Rango de la bitácora. Vacío = los últimos dos días, que es lo que decide el
  // servidor; con fechas, ese intervalo concreto.
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const [infoRango, setInfoRango] = useState(null);
  const notiRefs = useRef({});

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

  const cargarNotificaciones = async (filtro = rango) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtro.desde) params.set('desde', filtro.desde);
      if (filtro.hasta) params.set('hasta', filtro.hasta);
      const consulta = params.toString();

      const res = await API.get(`/notificaciones/todas${consulta ? `?${consulta}` : ''}`);
      setNotificaciones(res.data.notificaciones || []);
      setInfoRango(res.data.rango || null);
    } catch (e) {
      console.error(e);
      if (e.response?.data?.mensaje) alert(e.response.data.mensaje);
    } finally {
      setLoading(false);
    }
  };

  const limpiarRango = () => {
    const vacio = { desde: '', hasta: '' };
    setRango(vacio);
    cargarNotificaciones(vacio);
  };

  useEffect(() => {
    if (activeTab === 'auditoria') cargarHistorial();
    else if (activeTab === 'novedades') cargarNovedades();
    else if (activeTab === 'notificaciones') cargarNotificaciones();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'notificaciones' && targetNotiId && notificaciones.length > 0) {
      setTimeout(() => {
        const el = notiRefs.current[targetNotiId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.background = 'var(--marca-suave)';
          setTimeout(() => el.style.background = 'transparent', 3000);
        }
      }, 300);
    }
  }, [notificaciones, targetNotiId, activeTab]);

  const getIcon = (accion) => {
    if (accion.includes('Ruta')) return <i className="bi bi-map-fill"></i>;
    if (accion.includes('Conductor')) return <i className="bi bi-person-badge-fill"></i>;
    if (accion.includes('Vehículo')) return <i className="bi bi-truck"></i>;
    if (accion.includes('Configuración')) return <i className="bi bi-gear-fill"></i>;
    return <i className="bi bi-activity"></i>;
  };

  const getColor = (accion) => {
    if (accion.includes('Creación') || accion.includes('Registro') || accion.includes('Restauración')) return 'var(--color-primary)';
    if (accion.includes('Eliminación')) return 'var(--peligro)';
    if (accion.includes('Edición') || accion.includes('Actualización')) return 'var(--alerta)';
    return 'var(--texto-3)';
  };

  const s = {
    tab: (active) => ({
      padding: '12px 24px',
      cursor: 'pointer',
      borderBottom: `2px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
      color: active ? 'var(--texto)' : 'var(--text-muted)',
      fontWeight: active ? 600 : 400,
      transition: 'all 0.3s ease',
      fontSize: '14px'
    }),
    th: { padding: '15px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'left' },
    td: { padding: '15px 20px', fontSize: '14px', borderBottom: '1px solid var(--borde)' },
    border: 'var(--border-color)'
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--texto)' }}>
          Centro de Historial y Auditoría
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Seguimiento detallado de todas las acciones del sistema</p>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${s.border}` }}>
        <div style={s.tab(activeTab === 'auditoria')} onClick={() => setActiveTab('auditoria')}>
          <i className="bi bi-shield-check" style={{ marginRight: '8px' }}></i> Auditoría de Sistema
        </div>
        <div style={s.tab(activeTab === 'novedades')} onClick={() => setActiveTab('novedades')}>
          <i className="bi bi-journal-text" style={{ marginRight: '8px' }}></i> Bitácora de Novedades
        </div>
        <div style={s.tab(activeTab === 'notificaciones')} onClick={() => setActiveTab('notificaciones')}>
          <i className="bi bi-bell-fill" style={{ marginRight: '8px' }}></i> Notificaciones
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {activeTab === 'auditoria' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--superficie-2)' }}>
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
                  <td style={{ ...s.td, color: 'var(--texto-2)' }}>{log.detalles}</td>
                  <td style={s.td}>
                    <div style={{ fontWeight: 500 }}>{log.usuario_nombre || 'Sistema'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{log.usuario_email}</div>
                  </td>
                  <td style={{ ...s.td, fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(log.fecha).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'novedades' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--superficie-2)' }}>
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
                    <div style={{ fontWeight: 600, color: n.tipo_novedad === 'REPORTE_CONDUCTOR_TARDIO' ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                      <i className={n.tipo_novedad === 'REPORTE_CONDUCTOR_TARDIO' ? "bi bi-exclamation-triangle-fill" : "bi bi-lightning-fill"} style={{ marginRight: '8px' }}></i>
                      {n.tipo_novedad === 'REACTIVACION_MANUAL' ? 'Reactivación de Inicio' : 
                       n.tipo_novedad === 'REPORTE_CONDUCTOR_TARDIO' ? 'Reporte de Inicio Tardío' : n.tipo_novedad}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ruta: {n.ruta_nombre}</div>
                  </td>
                  <td style={{ ...s.td, color: 'var(--texto-2)' }}>
                    {n.tipo_novedad === 'REPORTE_CONDUCTOR_TARDIO' && <strong style={{ color: 'var(--color-danger)' }}>Motivo del conductor: </strong>}
                    {n.descripcion}
                  </td>
                  <td style={s.td}>
                    {/* El nombre real de quien reportó, no un genérico: ante un
                        inicio tardío lo primero que necesita saber el
                        administrador es qué conductor fue. */}
                    <div style={{ fontWeight: 500 }}>
                      {n.tipo_novedad === 'REPORTE_CONDUCTOR_TARDIO' ? (n.conductor_nombre || 'Conductor') : (n.admin_nombre || '—')}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{n.tipo_novedad === 'REPORTE_CONDUCTOR_TARDIO' ? 'Conductor' : 'Administrador'}</div>
                  </td>
                  <td style={{ ...s.td, fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(n.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'notificaciones' && (
          <>
          {/* La bitácora muestra los últimos dos días. Para consultar algo más
              antiguo se indica el rango; así la lista no crece sin control. */}
          <div className="filtros">
            {/* Las dos fechas son un solo dato — «de aquí hasta aquí» — y por eso
                comparten marco en lugar de ser dos cajas etiquetadas sueltas. */}
            <div className="filtros-rango">
              <i className="bi bi-calendar3"></i>
              <input type="date" aria-label="Fecha inicial" className={rango.desde ? '' : 'vacio'}
                value={rango.desde} max={rango.hasta || undefined}
                onChange={e => setRango({ ...rango, desde: e.target.value })} />
              <span className="filtros-separador">→</span>
              <input type="date" aria-label="Fecha final" className={rango.hasta ? '' : 'vacio'}
                value={rango.hasta} min={rango.desde || undefined}
                onChange={e => setRango({ ...rango, hasta: e.target.value })} />
            </div>

            <button className="btn btn-primary"
              disabled={!rango.desde && !rango.hasta}
              onClick={() => cargarNotificaciones()}>
              <i className="bi bi-search"></i> Buscar
            </button>

            {/* Sólo aparece cuando hay algo que descartar. */}
            {(rango.desde || rango.hasta) && (
              <button className="filtros-limpiar" onClick={limpiarRango}>Volver a los últimos 2 días</button>
            )}

            <div className="filtros-estado">
              <span className="punto"></span>
              {infoRango?.dias_por_omision
                ? `Últimos ${infoRango.dias_por_omision} días`
                : `${infoRango?.desde || 'Desde el inicio'} → ${infoRango?.hasta || 'hoy'}`}
              <span style={{ color: 'var(--texto-3)' }}>·</span>
              <span>{notificaciones.length} registros</span>
              {infoRango?.truncado && (
                <span className="aviso" title={`Sólo se muestran las ${infoRango.limite} más recientes del rango`}>
                  <i className="bi bi-exclamation-triangle-fill"></i> acotado
                </span>
              )}
              <i className="bi bi-question-circle filtros-ayuda"
                 title="El sistema conserva las notificaciones de los últimos 2 meses. Lo anterior se depura automáticamente."></i>
            </div>
          </div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>TIPO DE NOTIFICACIÓN</th>
                <th style={s.th}>MENSAJE</th>
                <th style={s.th}>FECHA Y HORA</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="3" style={{ padding: '40px', textAlign: 'center' }}>Cargando notificaciones...</td></tr>
              ) : notificaciones.length === 0 ? (
                <tr><td colSpan="3" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {rango.desde || rango.hasta
                    ? 'No hay notificaciones en el rango indicado.'
                    : 'No hay notificaciones en los últimos 2 días. Indique un rango para consultar más atrás.'}
                </td></tr>
              ) : notificaciones.map(n => (
                <tr key={n.id} ref={el => notiRefs.current[n.id] = el} style={{ transition: 'background 1s' }}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600, color: colorNotificacion(n.tipo) }}>
                      <i className={`bi ${iconoNotificacion(n)}`} style={{ marginRight: '8px' }}></i>
                      {tituloNotificacion(n.titulo)}
                    </div>
                  </td>
                  <td style={{ ...s.td, color: 'var(--texto-2)' }}>{n.mensaje}</td>
                  <td style={{ ...s.td, fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(n.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
