import { useState, useEffect } from 'react';
import { obtenerPuntosDescarga, crearPuntoDescarga, eliminarPuntoDescarga } from '../services/api';
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

const iconoRelleno = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3299/3299935.png',
  iconSize: [35, 35],
  iconAnchor: [17, 35],
});

function MapClickHandler({ onLocationSelected }) {
  useMapEvents({
    click: (e) => onLocationSelected([e.latlng.lat, e.latlng.lng]),
  });
  return null;
}

export default function PuntosDescarga() {
  const [puntos, setPuntos] = useState([]);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('relleno');
  const [ubicacion, setUbicacion] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { cargarPuntos(); }, []);

  const cargarPuntos = async () => {
    try {
      const res = await obtenerPuntosDescarga();
      setPuntos(res.data.puntos);
    } catch (e) { console.error(e); }
  };

  const handleGuardar = async () => {
    if (!nombre || !ubicacion) return alert('❌ Nombre y ubicación son obligatorios');
    setIsSaving(true);
    try {
      await crearPuntoDescarga({
        nombre,
        tipo,
        latitud_centro: ubicacion[0],
        longitud_centro: ubicacion[1]
      });
      setNombre('');
      setUbicacion(null);
      cargarPuntos();
    } catch (e) {
      alert('Error al guardar');
    } finally { setIsSaving(false); }
  };

  const handleEliminar = async (id) => {
    if (!window.confirm('¿Eliminar este punto?')) return;
    try {
      await eliminarPuntoDescarga(id);
      cargarPuntos();
    } catch (e) { alert('Error al eliminar'); }
  };

  return (
    <AdminLayout>
      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '20px', height: 'calc(100vh - 120px)' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'white' }}>
              <i className="bi bi-geo-fill" style={{ marginRight: '10px', color: 'var(--color-primary)' }}></i>
              Puntos de Descarga
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Rellenos y estaciones de transferencia</p>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Nombre del Lugar</label>
            <input 
              type="text" 
              className="card" 
              style={{ width: '100%', background: 'var(--bg-secondary)', color: 'white', padding: '12px', marginBottom: '15px' }} 
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Relleno Sanitario Los Ángeles"
            />

            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Tipo</label>
            <select 
              className="card" 
              style={{ width: '100%', background: 'var(--bg-secondary)', color: 'white', padding: '12px', marginBottom: '15px' }}
              value={tipo}
              onChange={e => setTipo(e.target.value)}
            >
              <option value="relleno">Relleno Sanitario</option>
              <option value="estacion">Estación de Transferencia</option>
            </select>

            <div style={{ fontSize: '11px', color: ubicacion ? 'var(--color-primary)' : 'var(--text-muted)', marginBottom: '15px' }}>
              {ubicacion ? (
                <>
                  <i className="bi bi-check-circle-fill" style={{ marginRight: '6px' }}></i>
                  Ubicación marcada: {ubicacion[0].toFixed(4)}, {ubicacion[1].toFixed(4)}
                </>
              ) : (
                <>
                  <i className="bi bi-cursor-fill" style={{ marginRight: '6px' }}></i>
                  Haz clic en el mapa para marcar la ubicación
                </>
              )}
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGuardar} disabled={isSaving}>
              <i className="bi bi-plus-lg" style={{ marginRight: '8px' }}></i>
              Registrar Punto
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <h4 style={{ fontSize: '14px', marginBottom: '10px', color: 'var(--text-muted)' }}>Puntos Registrados</h4>
            {puntos.map(p => (
              <div key={p.id} className="card" style={{ padding: '10px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{p.nombre}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{p.tipo}</div>
                </div>
                <button onClick={() => handleEliminar(p.id)} className="icon-btn icon-btn-danger" title="Eliminar Punto">
                  <i className="bi bi-trash3-fill"></i>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          <MapContainer center={[2.9273, -75.2819]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            <MapClickHandler onLocationSelected={setUbicacion} />
            
            {ubicacion && <Marker position={ubicacion} />}
            
            {puntos.map(p => (
              <Marker 
                key={p.id} 
                position={[p.latitud_centro, p.longitud_centro]}
                icon={iconoRelleno}
              >
                {/* Opcional: Popup con nombre */}
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </AdminLayout>
  );
}
