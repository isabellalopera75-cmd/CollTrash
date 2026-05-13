import { useState, useEffect } from 'react';
import API, { obtenerAsignaciones, reasignarAsignacion, obtenerConductores, obtenerVehiculos } from '../services/api';
import AdminLayout from '../components/Layout/AdminLayout';

export default function Rutas() {
  const [asignaciones, setAsignaciones] = useState([]);
  const [conteos, setConteos] = useState({});
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0]);
  const [cargando, setCargando] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  // Estados para reasignación
  const [conductores, setConductores] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [modalReasignar, setModalReasignar] = useState(false);
  const [asigAReasignar, setAsigAReasignar] = useState(null);
  const [formReasignar, setFormReasignar] = useState({ conductor_id: '', vehiculo_id: '' });

  // Generar los 6 días laborables de la vista superior (Saltando domingos)
  const diasVista = [];
  let current = new Date();
  while (diasVista.length < 6) {
    if (current.getDay() !== 0) { // 0 es domingo
      diasVista.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  useEffect(() => { 
    cargarAsignaciones(); 
    cargarDatosSelect();
  }, [fechaSeleccionada]);

  const cargarDatosSelect = async () => {
    try {
      const resC = await obtenerConductores();
      const resV = await obtenerVehiculos();
      setConductores(resC.data.conductores || []);
      setVehiculos(resV.data.vehiculos || []);
    } catch (error) {
      console.error(error);
    }
  };

  const cargarAsignaciones = async () => {
    setCargando(true);
    try {
      const res = await obtenerAsignaciones(fechaSeleccionada);
      setAsignaciones(res.data.asignaciones || []);
      setConteos(res.data.conteos || {});
    } catch (e) { console.error(e); }
    finally { setCargando(false); }
  };

  const handleGenerarSemana = async () => {
    setIsGenerating(true);
    try {
      await API.post('/test/generar-asignaciones');
      alert('✅ Jornada generada exitosamente.');
      cargarAsignaciones();
    } catch (e) { alert('Error al generar'); }
    finally { setIsGenerating(false); }
  };

  const abrirModalReasignar = (asignacion) => {
    setAsigAReasignar(asignacion);
    setFormReasignar({ conductor_id: asignacion.conductor_id, vehiculo_id: asignacion.vehiculo_id });
    setModalReasignar(true);
  };

  const handleReasignar = async (e) => {
    e.preventDefault();
    try {
      await reasignarAsignacion(asigAReasignar.id, formReasignar);
      setModalReasignar(false);
      cargarAsignaciones(); // Recargar tabla
      alert('Reasignación exitosa');
    } catch (error) {
      alert(error.response?.data?.mensaje || 'Error al reasignar');
    }
  };

  const getStatusClass = (status) => {
    if (status === 'en_progreso') return 'status-active';
    if (status === 'completado') return 'status-active';
    return 'status-warning';
  };

  const getStatusIcon = (status) => {
    if (status === 'en_progreso') return 'bi-play-circle-fill';
    if (status === 'completado') return 'bi-check-circle-fill';
    return 'bi-clock-history';
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>Gestión Semanal</h2>
           <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Calendario de rutas y asignaciones de la semana</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
           <button className="btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid #333' }}>
             <i className="bi bi-calendar3" style={{ marginRight: '8px' }}></i>
             Semana del {diasVista[0].getDate()} al {diasVista[5].getDate()} de {diasVista[0].toLocaleDateString('es-ES', { month: 'long' })}
           </button>
           <button className="btn btn-primary" onClick={handleGenerarSemana} disabled={isGenerating}>
             <i className="bi bi-magic" style={{ marginRight: '8px' }}></i>
             {isGenerating ? 'Generando...' : 'Nueva asignación'}
           </button>
        </div>
      </div>

      {/* Selector de Días Horizontal (Estilo Imagen 2) */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '30px', overflowX: 'auto', paddingBottom: '10px' }}>
        {diasVista.map((d, i) => {
          const iso = d.toISOString().split('T')[0];
          const activo = iso === fechaSeleccionada;
          return (
            <div 
              key={i} 
              onClick={() => setFechaSeleccionada(iso)}
              className={`card ${activo ? 'active' : ''}`}
              style={{ 
                minWidth: '120px', 
                textAlign: 'center', 
                cursor: 'pointer', 
                padding: '15px',
                border: activo ? '1px solid var(--color-primary)' : '1px solid transparent',
                background: activo ? 'rgba(0, 255, 157, 0.05)' : 'var(--bg-secondary)',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ fontSize: '12px', color: activo ? 'white' : 'var(--text-muted)', textTransform: 'capitalize' }}>
                {d.toLocaleDateString('es-ES', { weekday: 'short' })} {d.getDate()}
              </div>
              <div style={{ fontSize: '11px', color: activo ? 'var(--color-primary)' : 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                {conteos[iso] || 0} {(conteos[iso] === 1) ? 'ruta' : 'rutas'} 
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: activo ? 'var(--color-primary)' : '#444' }}></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filtros de Estado */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
         <button className="btn" style={{ background: 'rgba(0, 255, 157, 0.1)', color: 'var(--color-primary)', fontSize: '12px', borderRadius: '20px', padding: '5px 15px', border: '1px solid rgba(0, 255, 157, 0.2)' }}>
           <i className="bi bi-truck" style={{ marginRight: '8px' }}></i>
           1 En curso
         </button>
         <button className="btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontSize: '12px', borderRadius: '20px', padding: '5px 15px', border: '1px solid #333' }}>
           <i className="bi bi-clock" style={{ marginRight: '8px' }}></i>
           2 Pendientes
         </button>
      </div>

      {/* Tabla Premium (Estilo Imagen 2) */}
      <div className="data-table-container">
        <div className="data-table-header" style={{ gridTemplateColumns: '2fr 2fr 1.5fr' }}>
           <span>RUTA</span>
           <span>CONDUCTOR · VEHÍCULO</span>
           <span style={{ textAlign: 'right' }}>JORNADA · ESTADO · ACCIONES</span>
        </div>
        
        {cargando ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner"></div>
            Cargando asignaciones...
          </div>
        ) : asignaciones.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="bi bi-calendar-x" style={{ fontSize: '40px', display: 'block', marginBottom: '15px' }}></i>
            No hay rutas asignadas para esta fecha.
            <br/>
            Usa el botón "Nueva asignación" para crear la jornada.
          </div>
        ) : (
          <div>
            {asignaciones.map((a) => (
              <div key={a.id} className="data-table-row" style={{ gridTemplateColumns: '2fr 2fr 1.5fr', padding: '25px 20px' }}>
                {/* Columna Ruta y Progreso */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                   <div style={{ fontWeight: 600, fontSize: '15px', color: 'white' }}>{a.ruta_nombre}</div>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1, height: '6px', background: '#222', borderRadius: '3px', overflow: 'hidden' }}>
                         <div style={{ width: (a.progreso || 0) + '%', height: '100%', background: 'var(--color-primary)', boxShadow: '0 0 10px var(--color-primary)' }}></div>
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{a.progreso || 0}%</span>
                   </div>
                </div>

                {/* Columna Conductor y Vehículo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                   <div className="logo-circle" style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.03)', color: '#888' }}>
                     <i className="bi bi-person-circle" style={{ fontSize: '20px' }}></i>
                   </div>
                   <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'white' }}>{a.conductor_nombre}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{a.vehiculo_placa}</div>
                   </div>
                </div>

                {/* Columna Estado y Acciones */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '15px' }}>
                   <span style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '4px', background: 'rgba(255, 165, 0, 0.1)', color: 'orange', fontWeight: 700 }}>
                     {a.jornada_nombre?.toUpperCase()}
                   </span>
                   <span className={`status-badge ${getStatusClass(a.estado)}`} style={{ fontSize: '10px', padding: '5px 12px' }}>
                     <i className={`bi ${getStatusIcon(a.estado)}`} style={{ marginRight: '6px' }}></i>
                     {a.estado === 'pendiente' ? 'Pendiente' : (a.estado === 'en_progreso' ? 'En curso' : 'Completado')}
                   </span>
                   <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => abrirModalReasignar(a)} className="btn" style={{ padding: '6px', background: 'none', color: '#666' }} title="Reasignar">
                        <i className="bi bi-arrow-left-right"></i>
                      </button>
                      <button className="btn" style={{ padding: '6px', background: 'none', color: '#666' }} title="Ver Detalle">
                        <i className="bi bi-chevron-down"></i>
                      </button>
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Reasignación */}
      {modalReasignar && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '400px', border: '1px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', color: 'white' }}>
                <i className="bi bi-arrow-left-right" style={{ marginRight: '10px', color: 'var(--color-primary)' }}></i>
                Reasignar Turno
              </h3>
              <button onClick={() => setModalReasignar(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><i className="bi bi-x-lg"></i></button>
            </div>
            
            <div style={{ marginBottom: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Ruta: <strong style={{ color: 'white' }}>{asigAReasignar?.ruta_nombre}</strong> <br/>
              Fecha: {fechaSeleccionada} ({asigAReasignar?.jornada_nombre})
            </div>

            <form onSubmit={handleReasignar} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Nuevo Conductor</label>
                <select 
                  className="card" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'white', padding: '10px' }}
                  value={formReasignar.conductor_id}
                  onChange={(e) => setFormReasignar({...formReasignar, conductor_id: e.target.value})}
                  required
                >
                  <option value="">Seleccione un conductor...</option>
                  {conductores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Vehículo de Reemplazo</label>
                <select 
                  className="card" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'white', padding: '10px' }}
                  value={formReasignar.vehiculo_id}
                  onChange={(e) => setFormReasignar({...formReasignar, vehiculo_id: e.target.value})}
                  required
                >
                  <option value="">Seleccione un vehículo...</option>
                  {vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>Motivo del Cambio</label>
                <input 
                  type="text"
                  placeholder="Ej: Permiso médico, falla mecánica..."
                  className="card" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'white', padding: '10px', border: 'none' }}
                  value={formReasignar.motivo || ''}
                  onChange={(e) => setFormReasignar({...formReasignar, motivo: e.target.value})}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '10px', width: '100%' }}>
                Confirmar Reasignación
              </button>
            </form>

          </div>
        </div>
      )}

    </AdminLayout>
  );
}