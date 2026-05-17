import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import AdminLayout from '../components/Layout/AdminLayout';
import { io } from 'socket.io-client';

export default function Monitoreo() {
  const socketRef = useRef(null);
  const [vehiculos, setVehiculos] = useState([]);

  useEffect(() => {
    const socketUrl = window.location.hostname === 'localhost' && window.location.port !== '3000' ? 'http://localhost:3000' : window.location.origin;
    socketRef.current = io(socketUrl);
    
    socketRef.current.on('ubicacion_vehiculo', (data) => {
      setVehiculos(prev => {
        const existe = prev.find(v => v.id === data.id);
        if (existe) {
          return prev.map(v => v.id === data.id ? { ...v, ...data, last: '0s' } : v);
        }
        return [...prev, data];
      });
    });

    socketRef.current.on('nueva_novedad', (data) => {
      alert(`⚠️ Novedad del Conductor ${data.conductor}:\n\n${data.mensaje}`);
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const getStatusColor = (status) => {
    if (status === 'en_ruta') return 'var(--color-primary)';
    if (status === 'descargando') return 'var(--color-accent)';
    if (status === 'incidente') return 'var(--color-danger)';
    return 'var(--text-muted)';
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Monitoreo en Vivo</h2>
           <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Posición en tiempo real de todos los vehículos activos</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
           <div className="status-badge status-active">
             <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-primary)' }}></div>
             En vivo
           </div>
           <div style={{ color: 'var(--text-muted)', fontSize: '13px', textTransform: 'capitalize' }}>
             📅 {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
           </div>
        </div>
      </div>

      <div className="split-view">
        {/* Vehicles List Pane */}
        <div className="list-pane" style={{ width: '340px' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
             <h4 style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '8px' }}>Vehículos Activos</h4>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-primary)', fontWeight: 600 }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', animate: 'pulse' }}></div>
                {vehiculos.length} en operación
             </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {vehiculos.map((v) => (
              <div key={v.id} className="list-item" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                   <div style={{ display: 'flex', gap: '12px' }}>
                      <div className="logo-circle" style={{ width: '32px', height: '32px', background: 'var(--bg-secondary)', color: getStatusColor(v.estado), fontSize: '14px' }}>🚚</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{v.cod}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v.conductor}</div>
                      </div>
                   </div>
                   <span className="status-badge" style={{ fontSize: '8px', border: 'none', background: 'color-mix(in oklch, ' + getStatusColor(v.estado) + ', transparent 90%)', color: getStatusColor(v.estado) }}>
                     ● {v.estado.replace('_', ' ').toUpperCase()}
                   </span>
                </div>

                <div style={{ marginBottom: '12px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      <span>{v.ruta}</span>
                      <span>{v.progreso}%</span>
                   </div>
                   <div className="progress-container">
                      <div className="progress-fill" style={{ width: v.progreso + '%', background: getStatusColor(v.estado) }}></div>
                   </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                   <span>Sector {v.sector}</span>
                   <span>hace {v.last}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Map Pane */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer center={[2.9273, -75.2819]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            {vehiculos.map(v => (
              <CircleMarker 
                key={v.id} 
                center={[v.lat, v.lng]} 
                radius={12} 
                pathOptions={{ color: getStatusColor(v.estado), fillColor: getStatusColor(v.estado), fillOpacity: 0.8 }}
              >
                 <div style={{ color: 'white', fontSize: '10px', fontWeight: 'bold' }}>🚚</div>
              </CircleMarker>
            ))}
          </MapContainer>

          {/* Map Overlays */}
          <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 1000 }}>
             <div className="card" style={{ padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '13px' }}>Neiva, Huila</span>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Vista operacional</div>
             </div>
          </div>

          <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 1000 }}>
             <div className="card" style={{ padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--color-primary)', fontSize: '10px', fontWeight: 600 }}>
                📡 Actualiza cada 30s
             </div>
          </div>

          <div style={{ position: 'absolute', bottom: '20px', left: '20px', zIndex: 1000 }}>
             <div className="card" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                {['En ruta', 'Descargando', 'Incidente', 'Tardío'].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: i===3?0:'8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: i===0?'var(--color-primary)':(i===1?'var(--color-accent)':(i===2?'var(--color-danger)':'var(--color-warning)')) }}></div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s}</span>
                  </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}