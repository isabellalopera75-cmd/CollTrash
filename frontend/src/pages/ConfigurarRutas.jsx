import { useState, useEffect } from 'react';
import { token } from '../utils/tema';
import { 
  obtenerRutas, obtenerRutaPorId, crearRuta, editarRuta, eliminarRuta, restaurarRuta,
  obtenerVehiculos, obtenerJornadas, obtenerConductores, obtenerPuntosDescarga, obtenerConfig 
} from '../services/api';
import AdminLayout from '../components/Layout/AdminLayout';
import { MapContainer, Polyline, Marker, Popup, useMapEvents } from 'react-leaflet';
import MapaOscuro from '../components/MapaOscuro';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix para los iconos de Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const iconoDepot = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/609/609803.png',
  iconSize: [35, 35],
  iconAnchor: [17, 35],
});

const iconoRelleno = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3299/3299935.png',
  iconSize: [35, 35],
  iconAnchor: [17, 35],
});

function MapClickHandler({ onPointAdded, enabled }) {
  useMapEvents({
    click: (e) => {
      if (enabled) onPointAdded([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function ConfigurarRutas() {
  const [rutas, setRutas] = useState([]);
  const [conductores, setConductores] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [filtroJornada, setFiltroJornada] = useState('Todas');

  
  const [mostrarModal, setMostrarModal] = useState(false);
  // `puntos` es el sector que se está trazando ahora mismo; `sectoresCerrados`
  // son los tramos ya terminados, en su orden de visita (RF-11).
  const [puntos, setPuntos] = useState([]);
  const [sectoresCerrados, setSectoresCerrados] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [rutaEnEdicion, setRutaEnEdicion] = useState(null);
  const [form, setForm] = useState({
    nombre: '', jornada_id: '', conductor_default_id: '', vehiculo_id: '', dias_semana: []
  });

  const [depot, setDepot] = useState(null);
  const [descargas, setDescargas] = useState([]);

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    try {
      const [r, c, v, j, resCfg, resP] = await Promise.all([
        obtenerRutas(), obtenerConductores(), obtenerVehiculos(), obtenerJornadas(), 
        obtenerConfig(), obtenerPuntosDescarga()
      ]);
      setRutas(r.data.rutas);
      setConductores(c.data.conductores);
      setVehiculos(v.data.vehiculos);
      setJornadas(j.data.jornadas);
      setDescargas(resP.data.puntos || []);
      
      if (resCfg.data.config && resCfg.data.config.depot) {
        const d = JSON.parse(resCfg.data.config.depot);
        if (Array.isArray(d) && d.length === 2) setDepot(d);
      }
    } catch (e) { console.error(e); }
  };

  const handleEditarClick = async (ruta) => {
    try {
      const res = await obtenerRutaPorId(ruta.id);
      const rutaFull = res.data.ruta;
      const sectores = res.data.sectores;
      
      setRutaEnEdicion(rutaFull);
      setForm({
        nombre: rutaFull.nombre,
        jornada_id: rutaFull.jornada_id,
        conductor_default_id: rutaFull.conductor_default_id,
        vehiculo_id: rutaFull.vehiculo_id,
        dias_semana: rutaFull.dias_semana 
          ? String(rutaFull.dias_semana).split(',').map(d => parseInt(d.trim(), 10)).filter(n => !isNaN(n))
          : []
      });
      
      cargarSectoresEnFormulario(sectores);
      setMostrarModal(true);
    } catch (e) {
      alert('Error al cargar detalle de la ruta');
    }
  };

  /**
   * Vuelca los sectores guardados en el formulario.
   *
   * Antes sólo se leía `sectores[0]`, de modo que abrir para editar una ruta de
   * varios tramos mostraba el primero y descartaba el resto en silencio.
   */
  const cargarSectoresEnFormulario = (sectores) => {
    const tramos = (sectores || [])
      .map(sec => {
        try {
          const pts = JSON.parse(sec.trazado_geom || '[]');
          return Array.isArray(pts) && pts.length >= 2 ? { nombre: sec.nombre, puntos: pts } : null;
        } catch (e) { return null; }
      })
      .filter(Boolean);

    setSectoresCerrados(tramos);
    setPuntos([]);
  };

  const handleDuplicarClick = async (ruta) => {
    try {
      const res = await obtenerRutaPorId(ruta.id);
      const rutaFull = res.data.ruta;
      const sectores = res.data.sectores;
      
      setRutaEnEdicion(null); // Null indica que es una ruta nueva
      setForm({
        nombre: `${rutaFull.nombre} (Copia)`,
        jornada_id: rutaFull.jornada_id,
        conductor_default_id: rutaFull.conductor_default_id,
        vehiculo_id: rutaFull.vehiculo_id,
        dias_semana: [] // Limpiamos los días por defecto para evitar choques
      });
      
      cargarSectoresEnFormulario(sectores);
      setMostrarModal(true);
    } catch (e) {
      alert('Error al cargar detalle de la ruta');
    }
  };

  const handleNuevoClick = () => {
    setRutaEnEdicion(null);
    setForm({ nombre: '', jornada_id: '', conductor_default_id: '', vehiculo_id: '', dias_semana: [] });
    setPuntos([]);
    setSectoresCerrados([]);
    setMostrarModal(true);
  };

  const handleToggleEstado = async (ruta) => {
    try {
      await editarRuta(ruta.id, { activo: !ruta.activo });
      cargarDatos();
    } catch (e) { alert('Error al cambiar estado'); }
  };

  const handleEliminar = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar esta ruta permanentemente?')) return;
    try {
      await eliminarRuta(id);
      cargarDatos();
    } catch (e) { alert('Error al eliminar'); }
  };

  const handleGuardarRuta = async () => {
    if (!form.nombre || !form.jornada_id || !form.conductor_default_id || !form.vehiculo_id || form.dias_semana.length === 0) {
      return alert('❌ Completa todos los campos obligatorios.');
    }
    // El tramo que quedó a medio trazar cuenta como un sector más.
    const tramos = [...sectoresCerrados];
    if (puntos.length >= 2) {
      tramos.push({ nombre: `Sector ${tramos.length + 1}`, puntos });
    }

    if (tramos.length === 0) {
      return alert('❌ Traza el recorrido en el mapa (al menos dos puntos).');
    }

    setIsSaving(true);
    try {
      const payload = {
        ...form,
        dias_semana: form.dias_semana.join(', '),
        // Una ruta puede tener varios sectores y el orden es su orden de visita:
        // el conductor los marca uno a uno y el cumplimiento se calcula sobre
        // cuántos completó (RF-11, RF-31, RF-67).
        sectores: tramos.map((t, i) => ({
          nombre: (t.nombre || '').trim() || `Sector ${i + 1}`,
          orden: i + 1,
          trazado_geom: JSON.stringify(t.puntos),
          porcentaje_requerido: 90
        }))
      };

      if (rutaEnEdicion) {
        await editarRuta(rutaEnEdicion.id, payload);
      } else {
        await crearRuta(payload);
      }

      setMostrarModal(false);
      cargarDatos();
    } catch (e) {
      if (e.response?.status === 409 && e.response?.data?.requiereRestauracion) {
        if (window.confirm(e.response.data.mensaje)) {
          try {
            await restaurarRuta(e.response.data.rutaId);
            setMostrarModal(false);
            cargarDatos();
            return;
          } catch (restoreErr) {
            alert('❌ Error al restaurar la ruta');
          }
        }
      } else {
        alert('❌ Error: ' + (e.response?.data?.mensaje || 'Error de servidor'));
      }
    } finally { setIsSaving(false); }
  };

  const borrarUltimoPunto = () => setPuntos(puntos.slice(0, -1));

  const limpiarMapa = () => {
    setPuntos([]);
    setSectoresCerrados([]);
  };

  /**
   * Cierra el tramo en curso y abre el siguiente.
   *
   * El nuevo sector arranca en el último punto del anterior para que el
   * recorrido quede continuo: el simulador encadena los trazados de todos los
   * sectores, y si el siguiente empezara lejos el vehículo daría un salto.
   */
  const cerrarSector = () => {
    if (puntos.length < 2) {
      return alert('Un sector necesita al menos dos puntos antes de cerrarlo.');
    }
    setSectoresCerrados([...sectoresCerrados, { nombre: `Sector ${sectoresCerrados.length + 1}`, puntos }]);
    setPuntos([puntos[puntos.length - 1]]);
  };

  const renombrarSector = (indice, nombre) => {
    setSectoresCerrados(sectoresCerrados.map((s, i) => i === indice ? { ...s, nombre } : s));
  };

  const eliminarSector = (indice) => {
    setSectoresCerrados(sectoresCerrados.filter((s, i) => i !== indice));
  };

  // Colores alternos para que dos sectores contiguos se distingan en el mapa.
  const colorSector = (i) => (i % 2 === 0 ? token('--marca') : token('--info'));

  // Arranque del recorrido completo: el primer punto del primer sector, o el
  // del tramo en curso si todavía no se ha cerrado ninguno.
  const primerPuntoDelRecorrido = sectoresCerrados[0]?.puntos?.[0] || puntos[0] || null;

  return (
    <AdminLayout>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--texto)' }}>
             <i className="bi bi-map-fill" style={{ marginRight: '12px', color: 'var(--color-primary)' }}></i>
             Configuración de Rutas
           </h2>
           <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Diseño y optimización de la red de recolección</p>
        </div>
        <button className="btn btn-primary" onClick={handleNuevoClick}>
          <i className="bi bi-plus-lg" style={{ marginRight: '8px' }}></i>
          Nueva Ruta
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
        {['Todas', 'Mañana', 'Tarde'].map(jornada => (
          <button 
            key={jornada}
            onClick={() => setFiltroJornada(jornada)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: `1px solid ${filtroJornada === jornada ? 'var(--color-primary)' : 'var(--borde-fuerte)'}`,
              background: filtroJornada === jornada ? 'var(--marca-suave)' : 'transparent',
              color: filtroJornada === jornada ? 'var(--color-primary)' : 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {jornada === 'Todas' ? 'Todas las Rutas' : `Jornada ${jornada}`}
          </button>
        ))}
      </div>

      <div className="route-grid">
        {rutas.filter(r => filtroJornada === 'Todas' || r.jornada_nombre?.toLowerCase() === filtroJornada.toLowerCase()).map((ruta) => (

          <div key={ruta.id} className="card route-card" style={{ borderLeft: `4px solid ${ruta.activo ? 'var(--color-primary)' : 'var(--borde-fuerte)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="logo-circle" style={{ background: 'var(--marca-suave)', color: 'var(--color-primary)' }}>
                    <i className="bi bi-signpost-split"></i>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--texto)' }}>{ruta.nombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>#{ruta.id} • TURNO {ruta.jornada_nombre?.toUpperCase()}</div>
                  </div>
               </div>
               <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleDuplicarClick(ruta)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-3)' }} title="Duplicar">
                    <i className="bi bi-files"></i>
                  </button>
                  <button onClick={() => handleEditarClick(ruta)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-3)' }} title="Editar">
                    <i className="bi bi-pencil-square"></i>
                  </button>
                  <button onClick={() => handleEliminar(ruta.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-3)' }} title="Eliminar">
                    <i className="bi bi-trash3-fill"></i>
                  </button>
               </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', margin: '15px 0' }}>
               {['L', 'M', 'X', 'J', 'V', 'S'].map((letra, i) => {
                 const diasArr = ruta.dias_semana
                   ? String(ruta.dias_semana).split(',').map(d => parseInt(d.trim(), 10)).filter(n => !isNaN(n))
                   : [];
                 const estaActivo = diasArr.includes(i + 1);
                 return (
                   <div key={i} className={`day-pill ${estaActivo ? 'active' : ''}`} style={{ width: '28px', height: '28px', fontSize: '10px' }} translate="no">
                     {letra}
                   </div>
                 );
               })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--superficie-2)', padding: '10px', borderRadius: '8px' }}>
               <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Conductor</div>
                  <div style={{ fontWeight: 500, fontSize: '13px', color: 'var(--texto-2)' }}>{ruta.conductor_nombre}</div>
               </div>
               <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vehículo</div>
                  <div style={{ fontWeight: 500, fontSize: '13px', color: 'var(--texto-2)' }}>{ruta.vehiculo_placa}</div>
               </div>
            </div>
            
            <button 
              onClick={() => handleToggleEstado(ruta)} 
              className="btn" 
              style={{ 
                width: '100%', 
                marginTop: '15px', 
                fontSize: '11px', 
                background: ruta.activo ? 'var(--marca-suave)' : 'rgba(255, 255, 255, 0.05)',
                color: ruta.activo ? 'var(--color-primary)' : 'var(--text-muted)',
                border: `1px solid ${ruta.activo ? 'var(--color-primary)' : 'var(--borde-fuerte)'}`
              }}
            >
              {ruta.activo ? '● Ruta Activa' : '○ Ruta Inactiva'}
            </button>
          </div>
        ))}
      </div>

      {mostrarModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '1300px', height: '92vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '20px 30px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)' }}>
               <div>
                 <h3 style={{ fontSize: '20px', color: 'var(--texto)' }}>
                   <i className={`bi ${rutaEnEdicion ? 'bi-pencil' : 'bi-plus-circle'}`} style={{ marginRight: '10px' }}></i>
                   {rutaEnEdicion ? 'Editar Ruta' : 'Diseñar Nueva Ruta'}
                 </h3>
                 <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Haz clic en el mapa para trazar el recorrido</p>
               </div>
               <button className="btn" onClick={() => setMostrarModal(false)} style={{ background: 'var(--borde-fuerte)' }}>Cerrar</button>
            </div>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
               <div style={{ width: '350px', padding: '25px', borderRight: '1px solid var(--border-color)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Nombre de la Ruta</label>
                    <input type="text" className="card" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--texto)', padding: '12px' }} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Ej: Ruta Norte 01" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Jornada</label>
                      <select className="card" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--texto)', padding: '12px' }} value={form.jornada_id} onChange={e => setForm({...form, jornada_id: e.target.value})}>
                        <option value="">Selecciona...</option>
                        {jornadas.map(j => <option key={j.id} value={j.id}>{j.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Vehículo</label>
                      <select className="card" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--texto)', padding: '12px' }} value={form.vehiculo_id} onChange={e => setForm({...form, vehiculo_id: e.target.value})}>
                        <option value="">Selecciona...</option>
                        {(() => {
                          let disponibles = vehiculos;
                          if (form.jornada_id && form.dias_semana.length > 0) {
                            const ocupados = new Set();
                            rutas.forEach(r => {
                              if (r.activo && r.jornada_id === parseInt(form.jornada_id)) {
                                if (rutaEnEdicion && rutaEnEdicion.id === r.id) return;
                                const diasArr = r.dias_semana ? String(r.dias_semana).split(',').map(d => parseInt(d.trim(), 10)).filter(n => !isNaN(n)) : [];
                                if (diasArr.some(d => form.dias_semana.includes(d))) {
                                  if (r.vehiculo_id) ocupados.add(r.vehiculo_id);
                                }
                              }
                            });
                            disponibles = vehiculos.filter(v => !ocupados.has(v.id) || v.id === parseInt(form.vehiculo_id));
                          }
                          return disponibles.map(v => <option key={v.id} value={v.id}>{v.placa}</option>);
                        })()}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Conductor Titular</label>
                    <select className="card" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--texto)', padding: '12px' }} value={form.conductor_default_id} onChange={e => setForm({...form, conductor_default_id: e.target.value})}>
                      <option value="">Selecciona...</option>
                      {(() => {
                          let disponibles = conductores;
                          if (form.jornada_id && form.dias_semana.length > 0) {
                            const ocupados = new Set();
                            rutas.forEach(r => {
                              if (r.activo && r.jornada_id === parseInt(form.jornada_id)) {
                                if (rutaEnEdicion && rutaEnEdicion.id === r.id) return;
                                const diasArr = r.dias_semana ? String(r.dias_semana).split(',').map(d => parseInt(d.trim(), 10)).filter(n => !isNaN(n)) : [];
                                if (diasArr.some(d => form.dias_semana.includes(d))) {
                                  if (r.conductor_default_id) ocupados.add(r.conductor_default_id);
                                }
                              }
                            });
                            disponibles = conductores.filter(c => !ocupados.has(c.id) || c.id === parseInt(form.conductor_default_id));
                          }
                          return disponibles.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>);
                        })()}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Días de Recolección</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {[
                        { num: 1, label: 'lun' },
                        { num: 2, label: 'mar' },
                        { num: 3, label: 'mié' },
                        { num: 4, label: 'jue' },
                        { num: 5, label: 'vie' },
                        { num: 6, label: 'sáb' }
                      ].map(d => (
                        <button type="button" key={d.num} onClick={() => {
                          const cur = form.dias_semana;
                          setForm({...form, dias_semana: cur.includes(d.num) ? cur.filter(x => x !== d.num) : [...cur, d.num]});
                        }} className={`day-pill ${form.dias_semana.includes(d.num) ? 'active' : ''}`} style={{ width: 'auto', padding: '5px 12px', fontSize: '11px' }}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* flexShrink 0: el panel es una columna flexible y este bloque
                      era el unico con minHeight 0, asi que flexbox lo aplastaba
                      hasta dejar la lista de sectores en una rendija. */}
                  <div style={{ marginTop: '20px', borderTop: '1px solid var(--borde)', paddingTop: '20px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                       <span style={{ fontSize: '13px', color: 'var(--texto)', fontWeight: 600 }}>
                         Sectores del recorrido ({sectoresCerrados.length + (puntos.length >= 2 ? 1 : 0)})
                       </span>
                       <button onClick={limpiarMapa} className="btn" style={{ padding: '4px 8px', fontSize: '14px' }} title="Limpiar todo el trazado">
                         <i className="bi bi-trash3"></i>
                       </button>
                    </div>

                    {/* Sectores ya cerrados: nombre editable y baja individual */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                      {sectoresCerrados.map((sec, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--superficie-2)', borderRadius: 'var(--r-sm)', padding: '8px', borderLeft: `3px solid ${colorSector(i)}` }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: colorSector(i), width: '12px', flexShrink: 0 }}>{i + 1}</span>
                          {/* El nombre se edita aqui mismo: con fondo y borde
                              propios se lee como campo y no como texto fijo.
                              Todo en un renglon para que quepan varios sectores
                              a la vista sin pelear con el scroll. */}
                          <input
                            value={sec.nombre}
                            onChange={e => renombrarSector(i, e.target.value)}
                            placeholder={`Sector ${i + 1}`}
                            style={{ flex: 1, minWidth: 0, background: 'var(--fondo)', border: '1px solid var(--borde)', borderRadius: 'var(--r-sm)', color: 'var(--texto)', fontSize: '13px', padding: '7px 9px', outline: 'none' }}
                            onFocus={e => { e.target.style.borderColor = colorSector(i); }}
                            onBlur={e => { e.target.style.borderColor = 'var(--borde)'; }}
                            aria-label={`Nombre del sector ${i + 1}`}
                          />
                          <span style={{ fontSize: '10px', color: 'var(--texto-3)', whiteSpace: 'nowrap', flexShrink: 0 }} title={`${sec.puntos.length} puntos trazados`}>{sec.puntos.length} pts</span>
                          <button onClick={() => eliminarSector(i)} className="btn" style={{ padding: '4px 7px', fontSize: '11px', flexShrink: 0 }} title={`Quitar ${sec.nombre}`}>
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Tramo en curso */}
                    <div style={{ marginTop: '12px', flexShrink: 0, background: 'var(--alerta-suave)', border: `1px dashed ${token('--alerta')}`, borderRadius: 'var(--r-sm)', padding: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--texto)' }}>
                          Sector {sectoresCerrados.length + 1} en curso: <strong>{puntos.length}</strong> {puntos.length === 1 ? 'punto' : 'puntos'}
                        </span>
                        <button onClick={borrarUltimoPunto} className="btn" style={{ padding: '2px 8px', fontSize: '13px' }} title="Deshacer último punto" disabled={puntos.length === 0}>
                          <i className="bi bi-arrow-90deg-left"></i>
                        </button>
                      </div>
                      <button
                        onClick={cerrarSector}
                        className="btn"
                        disabled={puntos.length < 2}
                        style={{ width: '100%', marginTop: '8px', padding: '6px', fontSize: '12px', fontWeight: 600, opacity: puntos.length < 2 ? 0.5 : 1 }}
                      >
                        <i className="bi bi-scissors" style={{ marginRight: '6px' }}></i>
                        Cerrar sector y empezar el siguiente
                      </button>
                      <p style={{ fontSize: '10px', color: 'var(--texto-3)', marginTop: '6px', lineHeight: 1.4 }}>
                        El conductor marca cada sector por separado. Si no divides el recorrido, la ruta se guarda con un solo sector.
                      </p>
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto' }}>
                     <button className="btn btn-primary" style={{ width: '100%', padding: '15px', fontWeight: 600 }} onClick={handleGuardarRuta} disabled={isSaving}>
                       {isSaving ? 'Guardando...' : (rutaEnEdicion ? 'Actualizar Ruta' : 'Crear Ruta Fija')}
                     </button>
                  </div>
               </div>
               <div style={{ flex: 1, background: 'var(--fondo)', position: 'relative' }}>
                  <MapContainer center={primerPuntoDelRecorrido || (depot && depot[0] ? depot : [2.9273, -75.2819])} zoom={14} style={{ height: '100%', width: '100%' }}>
                     <MapaOscuro />
                     <MapClickHandler onPointAdded={(pt) => setPuntos([...puntos, pt])} enabled={true} />
                     
                     {depot && depot[0] && depot[1] && (
                        <Marker position={depot} icon={iconoDepot}>
                          <Popup>Punto de Inicio (Depósito)</Popup>
                        </Marker>
                      )}

                      {descargas && descargas.filter(d => d.latitud_centro && d.longitud_centro).map(d => (
                        <Marker key={d.id} position={[d.latitud_centro, d.longitud_centro]} icon={iconoRelleno}>
                          <Popup>{d.nombre}</Popup>
                        </Marker>
                      ))}

                      {/* Línea punteada del depósito al arranque del recorrido */}
                      {depot && depot[0] && primerPuntoDelRecorrido && (
                        <Polyline positions={[depot, primerPuntoDelRecorrido]} color={token('--texto-3')} weight={2} dashArray="5, 10" />
                      )}

                     {/* Un trazo por sector cerrado, en colores alternos, con su
                         número al inicio para leer el orden de visita. */}
                     {sectoresCerrados.map((sec, i) => (
                       <Polyline key={`sec-${i}`} positions={sec.puntos} color={colorSector(i)} weight={5} opacity={0.85} />
                     ))}
                     {sectoresCerrados.map((sec, i) => (
                       <Marker key={`num-${i}`} position={sec.puntos[0]} icon={new L.DivIcon({
                         className: 'custom-div-icon',
                         html: `<div style="background:${colorSector(i)}; color:#fff; width:20px; height:20px; border-radius:50%; border:2px solid white; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center;">${i + 1}</div>`,
                         iconSize: [20, 20],
                         iconAnchor: [10, 10]
                       })}>
                         <Popup>{sec.nombre}</Popup>
                       </Marker>
                     ))}

                     {/* Tramo en curso: en ámbito discontinuo para distinguir lo
                         que aún no se ha cerrado de lo que ya es un sector. */}
                     {puntos.length > 1 && <Polyline positions={puntos} color={token('--alerta')} weight={5} opacity={0.9} dashArray="10, 6" />}
                     {puntos.filter(p => p && Array.isArray(p) && p.length === 2).map((p, i) => (
                       <Marker key={`pt-${i}`} position={p} icon={new L.DivIcon({
                         className: 'custom-div-icon',
                         html: `<div style="background:${token('--alerta')}; width:10px; height:10px; border-radius:50%; border:2px solid white;"></div>`,
                         iconSize: [10, 10],
                         iconAnchor: [5, 5]
                       })} />
                     ))}
                  </MapContainer>
                  <div style={{ position: 'absolute', bottom: '20px', right: '20px', background: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '8px', fontSize: '11px', color: 'var(--texto)', zIndex: 1000, pointerEvents: 'none', border: '1px solid var(--color-primary)' }}>
                     <i className="bi bi-info-circle-fill" style={{ marginRight: '8px', color: 'var(--color-primary)' }}></i>
                     Haz clic en el mapa para añadir los puntos de la línea azul.
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
