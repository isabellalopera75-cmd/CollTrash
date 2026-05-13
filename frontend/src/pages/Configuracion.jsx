import { useState, useEffect } from 'react';
import { obtenerJornadas, crearJornada, editarJornada, obtenerConfig, actualizarConfig } from '../services/api';
import AdminLayout from '../components/Layout/AdminLayout';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix para iconos
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const iconoDepot = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/609/609803.png', // Icono de edificio/base
  iconSize: [35, 35],
  iconAnchor: [17, 35],
});

function MapClickHandler({ onLocationSelected }) {
  useMapEvents({
    click: (e) => onLocationSelected([e.latlng.lat, e.latlng.lng]),
  });
  return null;
}

export default function Configuracion() {
  const [tab, setTab] = useState('general');
  const [jornadas, setJornadas] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({ nombre: '', hora_inicio: '', hora_limite_fin: '' });
  const [cargando, setCargando] = useState(true);

  // Configuración general
  const [config, setConfig] = useState({ depot: null });
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const resJ = await obtenerJornadas();
      setJornadas(resJ.data.jornadas || []);
      
      const resC = await obtenerConfig();
      const cfg = resC.data.config;
      if (cfg.depot) {
        setConfig({ depot: JSON.parse(cfg.depot) });
      }
    } catch (e) { console.error(e); }
    finally { setCargando(false); }
  };

  const handleGuardarConfig = async () => {
    if (!config.depot) return alert('⚠️ Selecciona el punto de inicio en el mapa');
    setIsSavingConfig(true);
    try {
      await actualizarConfig({ clave: 'depot', valor: config.depot });
      alert('✅ Centro de operaciones actualizado correctamente');
    } catch (e) {
      alert('Error al guardar configuración');
    } finally { setIsSavingConfig(false); }
  };

  const handleAbrirModal = (jornada = null) => {
    if (jornada) {
      setEditandoId(jornada.id);
      const inicio = jornada.hora_inicio ? jornada.hora_inicio.substring(0, 5) : '';
      const fin = jornada.hora_limite_fin ? jornada.hora_limite_fin.substring(0, 5) : '';
      setForm({ nombre: jornada.nombre, hora_inicio: inicio, hora_limite_fin: fin });
    } else {
      setEditandoId(null);
      setForm({ nombre: '', hora_inicio: '', hora_limite_fin: '' });
    }
    setMostrarModal(true);
  };

  const handleSubmitJornada = async (e) => {
    e.preventDefault();
    try {
      if (editandoId) {
        await editarJornada(editandoId, form);
        alert('✅ Jornada actualizada');
      } else {
        await crearJornada(form);
        alert('✅ Jornada creada');
      }
      setMostrarModal(false);
      cargarDatos();
    } catch (e) { 
      alert('❌ Error: ' + (e.response?.data?.mensaje || e.message)); 
    }
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>
             <i className="bi bi-gear-fill" style={{ marginRight: '12px', color: 'var(--color-primary)' }}></i>
             Configuración de Sistema
           </h2>
           <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Gestión de parámetros y puntos estratégicos</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', borderBottom: '1px solid #222' }}>
        <button onClick={() => setTab('general')} style={{ padding: '12px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'general' ? 'var(--color-primary)' : 'transparent'}`, color: tab === 'general' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>General</button>
        <button onClick={() => setTab('jornadas')} style={{ padding: '12px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'jornadas' ? 'var(--color-primary)' : 'transparent'}`, color: tab === 'jornadas' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>Turnos / Jornadas</button>
      </div>

      {tab === 'general' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '24px', height: 'calc(100vh - 250px)' }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ fontSize: '18px', color: 'white', marginBottom: '8px' }}>Centro de Operaciones</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Establece el punto de partida (parqueadero/depósito) de todos los camiones.</p>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px', border: '1px solid #333' }}>
              <div style={{ fontSize: '11px', color: config.depot ? 'var(--color-primary)' : 'var(--text-muted)', marginBottom: '15px' }}>
                {config.depot ? (
                  <>
                    <i className="bi bi-check-circle-fill" style={{ marginRight: '6px' }}></i>
                    Ubicación guardada: {config.depot[0].toFixed(5)}, {config.depot[1].toFixed(5)}
                  </>
                ) : (
                  <>
                    <i className="bi bi-info-circle" style={{ marginRight: '6px' }}></i>
                    Haz clic en el mapa para marcar el depósito central.
                  </>
                )}
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGuardarConfig} disabled={isSavingConfig}>
                <i className="bi bi-save" style={{ marginRight: '8px' }}></i>
                {isSavingConfig ? 'Guardando...' : 'Guardar Punto de Inicio'}
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid #333' }}>
            <MapContainer center={[2.9273, -75.2819]} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              <MapClickHandler onLocationSelected={(loc) => setConfig({ depot: loc })} />
              {config.depot && <Marker position={config.depot} icon={iconoDepot} />}
            </MapContainer>
          </div>
        </div>
      )}

      {tab === 'jornadas' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px' }}>Gestión de Turnos</h3>
            <button className="btn btn-primary" onClick={() => handleAbrirModal()}>+ Nueva Jornada</button>
          </div>

          <div className="data-table-container">
            <div className="data-table-header" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
              <span>NOMBRE</span>
              <span>INICIO</span>
              <span>FIN LÍMITE</span>
              <span style={{ textAlign: 'right' }}>ACCIONES</span>
            </div>
            {cargando ? (
              <div style={{ padding: '20px' }}>Cargando...</div>
            ) : jornadas.map(j => (
              <div key={j.id} className="data-table-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
                <span style={{ fontWeight: 600 }}>{j.nombre}</span>
                <span>{j.hora_inicio}</span>
                <span>{j.hora_limite_fin}</span>
                <div style={{ textAlign: 'right' }}>
                  <button onClick={() => handleAbrirModal(j)} className="icon-btn"><i className="bi bi-pencil-square"></i></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Jornada */}
      {mostrarModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '400px', border: '1px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', color: 'white' }}>{editandoId ? 'Editar Turno' : 'Nuevo Turno'}</h3>
              <button onClick={() => setMostrarModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><i className="bi bi-x-lg"></i></button>
            </div>
            <form onSubmit={handleSubmitJornada} style={{ display: 'grid', gap: '16px' }}>
              <input type="text" required value={form.nombre} className="card" style={{ width:'100%', background:'var(--bg-secondary)', border:'none', color:'white', padding:'12px' }} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Nombre" />
              <input type="time" required value={form.hora_inicio} className="card" style={{ width:'100%', background:'var(--bg-secondary)', border:'none', color:'white', padding:'12px' }} onChange={e => setForm({...form, hora_inicio: e.target.value})} />
              <input type="time" required value={form.hora_limite_fin} className="card" style={{ width:'100%', background:'var(--bg-secondary)', border:'none', color:'white', padding:'12px' }} onChange={e => setForm({...form, hora_limite_fin: e.target.value})} />
              <button type="submit" className="btn btn-primary" style={{ padding: '14px' }}>Guardar</button>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
