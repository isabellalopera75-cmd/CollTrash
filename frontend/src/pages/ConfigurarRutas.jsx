import { useState, useEffect } from 'react';
import { 
  obtenerRutas, obtenerRutaPorId, crearRuta, editarRuta, eliminarRuta, restaurarRuta,
  obtenerVehiculos, obtenerJornadas, obtenerConductores, obtenerPuntosDescarga, obtenerConfig 
} from '../services/api';
import AdminLayout from '../components/Layout/AdminLayout';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMapEvents } from 'react-leaflet';
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
  const [puntos, setPuntos] = useState([]);
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
        dias_semana: rutaFull.dias_semana ? rutaFull.dias_semana.split(', ').map(Number) : []
      });
      
      if (sectores && sectores.length > 0) {
        setPuntos(JSON.parse(sectores[0].trazado_geom || '[]'));
      } else {
        setPuntos([]);
      }
      
      setMostrarModal(true);
    } catch (e) {
      alert('Error al cargar detalle de la ruta');
    }
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
      
      if (sectores && sectores.length > 0) {
        setPuntos(JSON.parse(sectores[0].trazado_geom || '[]'));
      } else {
        setPuntos([]);
      }
      
      setMostrarModal(true);
    } catch (e) {
      alert('Error al cargar detalle de la ruta');
    }
  };

  const handleNuevoClick = () => {
    setRutaEnEdicion(null);
    setForm({ nombre: '', jornada_id: '', conductor_default_id: '', vehiculo_id: '', dias_semana: [] });
    setPuntos([]);
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
    if (puntos.length < 2) return alert('❌ Traza el recorrido en el mapa.');

    setIsSaving(true);
    try {
      const payload = {
        ...form,
        dias_semana: form.dias_semana.join(', '),
        sectores: [{ 
          nombre: `Sector Único - ${form.nombre}`, 
          orden: 1, 
          trazado_geom: JSON.stringify(puntos), 
          porcentaje_requerido: 90 
        }]
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
  const limpiarMapa = () => setPuntos([]);

  return (
    <AdminLayout>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>
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
              border: `1px solid ${filtroJornada === jornada ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)'}`,
              background: filtroJornada === jornada ? 'rgba(0, 255, 157, 0.1)' : 'transparent',
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

          <div key={ruta.id} className="card route-card" style={{ borderLeft: `4px solid ${ruta.activo ? 'var(--color-primary)' : '#444'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="logo-circle" style={{ background: 'rgba(0, 255, 157, 0.1)', color: 'var(--color-primary)' }}>
                    <i className="bi bi-signpost-split"></i>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '16px', color: 'white' }}>{ruta.nombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>#{ruta.id} • {ruta.jornada_nombre}</div>
                  </div>
               </div>
               <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleDuplicarClick(ruta)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888' }} title="Duplicar">
                    <i className="bi bi-files"></i>
                  </button>
                  <button onClick={() => handleEditarClick(ruta)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888' }} title="Editar">
                    <i className="bi bi-pencil-square"></i>
                  </button>
                  <button onClick={() => handleEliminar(ruta.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888' }} title="Eliminar">
                    <i className="bi bi-trash3-fill"></i>
                  </button>
               </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', margin: '15px 0' }}>
               {['L', 'M', 'X', 'J', 'V', 'S'].map((letra, i) => {
                 const diasArr = ruta.dias_semana
                   ? ruta.dias_semana.split(',').map(Number)
                   : [];
                 const estaActivo = diasArr.includes(i + 1);
                 return (
                   <div key={i} className={`day-pill ${estaActivo ? 'active' : ''}`} style={{ width: '28px', height: '28px', fontSize: '10px' }} translate="no">
                     {letra}
                   </div>
                 );
               })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px' }}>
               <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Conductor</div>
                  <div style={{ fontWeight: 500, fontSize: '13px', color: '#eee' }}>{ruta.conductor_nombre}</div>
               </div>
               <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vehículo</div>
                  <div style={{ fontWeight: 500, fontSize: '13px', color: '#eee' }}>{ruta.vehiculo_placa}</div>
               </div>
            </div>
            
            <button 
              onClick={() => handleToggleEstado(ruta)} 
              className="btn" 
              style={{ 
                width: '100%', 
                marginTop: '15px', 
                fontSize: '11px', 
                background: ruta.activo ? 'rgba(0, 255, 157, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                color: ruta.activo ? 'var(--color-primary)' : 'var(--text-muted)',
                border: `1px solid ${ruta.activo ? 'var(--color-primary)' : '#444'}`
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
                 <h3 style={{ fontSize: '20px', color: 'white' }}>
                   <i className={`bi ${rutaEnEdicion ? 'bi-pencil' : 'bi-plus-circle'}`} style={{ marginRight: '10px' }}></i>
                   {rutaEnEdicion ? 'Editar Ruta' : 'Diseñar Nueva Ruta'}
                 </h3>
                 <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Haz clic en el mapa para trazar el recorrido</p>
               </div>
               <button className="btn" onClick={() => setMostrarModal(false)} style={{ background: 'rgba(255,255,255,0.1)' }}>Cerrar</button>
            </div>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
               <div style={{ width: '350px', padding: '25px', borderRight: '1px solid var(--border-color)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Nombre de la Ruta</label>
                    <input type="text" className="card" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'white', padding: '12px' }} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Ej: Ruta Norte 01" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Jornada</label>
                      <select className="card" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'white', padding: '12px' }} value={form.jornada_id} onChange={e => setForm({...form, jornada_id: e.target.value})}>
                        <option value="">Selecciona...</option>
                        {jornadas.map(j => <option key={j.id} value={j.id}>{j.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Vehículo</label>
                      <select className="card" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'white', padding: '12px' }} value={form.vehiculo_id} onChange={e => setForm({...form, vehiculo_id: e.target.value})}>
                        <option value="">Selecciona...</option>
                        {vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Conductor Titular</label>
                    <select className="card" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'white', padding: '12px' }} value={form.conductor_default_id} onChange={e => setForm({...form, conductor_default_id: e.target.value})}>
                      <option value="">Selecciona...</option>
                      {conductores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Días de Recolección</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {['lunes','martes','miércoles','jueves','viernes','sábado'].map(d => (
                        <button key={d} onClick={() => {
                          const cur = form.dias_semana;
                          setForm({...form, dias_semana: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d]});
                        }} className={`day-pill ${form.dias_semana.includes(d) ? 'active' : ''}`} style={{ width: 'auto', padding: '5px 12px', fontSize: '11px' }}>
                          {d.substring(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                       <span style={{ fontSize: '13px', color: 'white' }}>Trazado: {puntos.length} puntos</span>
                       <div style={{ display: 'flex', gap: '5px' }}>
                          <button onClick={borrarUltimoPunto} className="btn" style={{ padding: '4px 8px', fontSize: '14px' }} title="Deshacer último punto">
                            <i className="bi bi-arrow-90deg-left"></i>
                          </button>
                          <button onClick={limpiarMapa} className="btn" style={{ padding: '4px 8px', fontSize: '14px' }} title="Limpiar todo">
                            <i className="bi bi-trash3"></i>
                          </button>
                       </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto' }}>
                     <button className="btn btn-primary" style={{ width: '100%', padding: '15px', fontWeight: 600 }} onClick={handleGuardarRuta} disabled={isSaving}>
                       {isSaving ? 'Guardando...' : (rutaEnEdicion ? 'Actualizar Ruta' : 'Crear Ruta Fija')}
                     </button>
                  </div>
               </div>
               <div style={{ flex: 1, background: '#0b0c10', position: 'relative' }}>
                  <MapContainer center={puntos.length > 0 && puntos[0] ? puntos[0] : (depot && depot[0] ? depot : [2.9273, -75.2819])} zoom={14} style={{ height: '100%', width: '100%' }}>
                     <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
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

                      {depot && depot[0] && puntos.length > 0 && puntos[0] && (
                        <Polyline positions={[depot, puntos[0]]} color="#666" weight={2} dashArray="5, 10" />
                      )}

                     {puntos.length > 1 && <Polyline positions={puntos} color="var(--color-primary)" weight={5} opacity={0.8} />}
                     {puntos.filter(p => p && Array.isArray(p) && p.length === 2).map((p, i) => (
                       <Marker key={i} position={p} icon={new L.DivIcon({
                         className: 'custom-div-icon',
                         html: `<div style="background:var(--color-primary); width:10px; height:10px; border-radius:50%; border:2px solid white;"></div>`,
                         iconSize: [10, 10],
                         iconAnchor: [5, 5]
                       })} />
                     ))}
                  </MapContainer>
                  <div style={{ position: 'absolute', bottom: '20px', right: '20px', background: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '8px', fontSize: '11px', color: 'white', zIndex: 1000, pointerEvents: 'none', border: '1px solid var(--color-primary)' }}>
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
