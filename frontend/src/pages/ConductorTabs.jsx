import { useState } from 'react';
import API, { getAssetUrl } from '../services/api';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet';
import { useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// ─── Centrar mapa cuando cambia posición ────────────────────
function MapCenterer({ center }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

// ─── Tab Ruta ────────────────────────────────────────────────
export function TabRuta({ paradas, posicion, asignacion, reportesCiudadanos = [] }) {
  const activa = paradas.find(p => p.estado === 'en_curso' || p.estado === 'en_progreso') || paradas.find(p => p.estado === 'pendiente');
  const centro = posicion || [2.9273, -75.2819];
  
  // Construir trazado de todos los sectores
  const trazadoTotal = paradas.reduce((acc, p) => {
    try { if (p.trazado_geom) return [...acc, ...JSON.parse(p.trazado_geom)]; } catch {}
    return acc;
  }, []);

  // Centro de cada parada para el marcador
  const centroPunto = (p) => {
    try {
      const t = JSON.parse(p.trazado_geom);
      return t[Math.floor(t.length / 2)];
    } catch { return null; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* MAPA */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <MapContainer center={centro} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          {posicion && <MapCenterer center={posicion} />}
          
          {trazadoTotal.length > 0 && (
            <Polyline positions={trazadoTotal} color="#22c55e" weight={3} dashArray="8,4" opacity={0.8} />
          )}

          {paradas.map(p => {
            const c = centroPunto(p);
            if (!c) return null;
            const color = p.estado === 'completado' ? '#22c55e' : (p.estado === 'en_curso' || p.estado === 'en_progreso') ? '#F59E0B' : '#6b7280';
            return (
              <CircleMarker key={p.id} center={c} radius={8} color="white" weight={2} fillColor={color} fillOpacity={1}>
                <Popup>{p.nombre}</Popup>
              </CircleMarker>
            );
          })}

          {/* Reportes Ciudadanos Asignados */}
          {reportesCiudadanos.filter(r => r.estado === 'en_proceso').map(r => (
            <CircleMarker 
              key={`reporte-${r.id}`} 
              center={[parseFloat(r.latitud), parseFloat(r.longitud)]} 
              radius={10} 
              color="#ffffff" 
              weight={2.5} 
              fillColor="#ef4444" 
              fillOpacity={1}
            >
              <Popup>
                <div style={{ color: 'white', fontFamily: 'Inter, sans-serif', padding: '2px' }}>
                  <strong style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    🚨 Reporte Ciudadano
                  </strong>
                  <div style={{ fontWeight: 700, fontSize: '13px', margin: '6px 0 2px 0' }}>{r.tipo_problema}</div>
                  <div style={{ fontSize: '11px', color: '#ccc', lineHeight: '1.4' }}>{r.descripcion}</div>
                  {r.nombre_ciudadano && <div style={{ fontSize: '10px', color: '#999', marginTop: '6px' }}>Reportado por: {r.nombre_ciudadano}</div>}
                  {r.foto_url && (
                    <div style={{ marginTop: '8px' }}>
                      <img 
                        src={getAssetUrl(r.foto_url)} 
                        alt="Evidencia" 
                        style={{ width: '100%', maxHeight: '80px', objectFit: 'cover', borderRadius: '4px' }}
                      />
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {posicion && (
            <CircleMarker center={posicion} radius={12} color="#F59E0B" weight={3} fillColor="#F59E0B" fillOpacity={0.4}>
              <Popup>🚛 Tu posición</Popup>
            </CircleMarker>
          )}
        </MapContainer>
      </div>

      {/* Card próxima parada */}
      {activa && (
        <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.9)', borderTop: '1px solid #333' }}>
          <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px' }}>PRÓXIMO SECTOR</div>
          <div style={{ fontWeight: 700, color: 'white', fontSize: '14px' }}>{activa.nombre}</div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>Sector {activa.orden} · {activa.porcentaje_requerido}% del trazado</div>
        </div>
      )}
    </div>
  );
}

// ─── Tab Paradas ─────────────────────────────────────────────
export function TabParadas({ 
  paradas, 
  onCompletar, 
  completando, 
  reportesCiudadanos = [], 
  onResolverReporte,
  iniciarDescarga,
  completarDescarga,
  descargaActiva
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* SECCIÓN 1: PARADAS OFICIALES */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#22c55e', letterSpacing: '1px', marginBottom: '10px' }}>
          📍 SECTORES OFICIALES DE LA RUTA
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {paradas.map(p => {
            const completada = p.estado === 'completado';
            const activa = p.estado === 'en_curso' || p.estado === 'en_progreso';
            return (
              <div key={p.id} style={{
                padding: '14px',
                borderRadius: '12px',
                background: completada ? 'rgba(34,197,94,0.06)' : activa ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${completada ? 'rgba(34,197,94,0.2)' : activa ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`,
                display: 'flex', alignItems: 'center', gap: '12px'
              }}>
                {/* Ícono estado */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: completada ? 'rgba(34,197,94,0.2)' : activa ? 'rgba(245,158,11,0.2)' : 'rgba(107,114,128,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px'
                }}>
                  {completada ? <i className="bi bi-check-lg" style={{ color: '#22c55e' }}></i>
                    : activa ? <i className="bi bi-clock-fill" style={{ color: '#F59E0B' }}></i>
                    : <span style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280' }}>{p.orden}</span>}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: completada ? '#9ca3af' : 'white', textDecoration: completada ? 'line-through' : 'none' }}>
                    {p.nombre}
                  </div>
                  {completada && p.completado_at && (
                    <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '2px' }}>
                      ✓ {new Date(p.completado_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  {activa && (
                    <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '2px' }}>
                      {descargaActiva && parseInt(descargaActiva.sector_asignacion_id) === parseInt(p.id) ? '⏸️ Pausado (Descarga)' : 'En curso'}
                    </div>
                  )}
                  {!completada && !activa && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Pendiente</div>}
                </div>

                {/* Botones de acción */}
                {activa && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                    {descargaActiva && parseInt(descargaActiva.sector_asignacion_id) === parseInt(p.id) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <button
                          onClick={() => completarDescarga()}
                          style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#F59E0B', color: '#000', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}
                        >
                          🏁 Regreso Descarga
                        </button>
                        {descargaActiva.latitud_centro && descargaActiva.longitud_centro && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${descargaActiva.latitud_centro},${descargaActiva.longitud_centro}&travelmode=driving`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ 
                              padding: '8px 12px', 
                              borderRadius: '8px', 
                              border: 'none', 
                              background: '#2563eb', 
                              color: 'white', 
                              fontWeight: 700, 
                              fontSize: '11px', 
                              textDecoration: 'none',
                              textAlign: 'center',
                              display: 'inline-block'
                            }}
                          >
                            🗺️ Cómo llegar
                          </a>
                        )}
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => onCompletar(p.id)}
                          disabled={completando || !!descargaActiva}
                          style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#000', fontWeight: 700, fontSize: '11px', cursor: (completando || !!descargaActiva) ? 'not-allowed' : 'pointer', opacity: !!descargaActiva ? 0.5 : 1 }}
                        >
                          {completando ? 'Marcando…' : 'Completar'}
                        </button>
                        
                        <button
                          onClick={() => iniciarDescarga(p.id)}
                          disabled={!!descargaActiva}
                          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #F59E0B', background: 'transparent', color: '#F59E0B', fontWeight: 700, fontSize: '11px', cursor: !!descargaActiva ? 'not-allowed' : 'pointer', opacity: !!descargaActiva ? 0.5 : 1 }}
                        >
                          🚛 Pausa Descarga
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECCIÓN 2: REPORTES CIUDADANOS */}
      {reportesCiudadanos && reportesCiudadanos.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', letterSpacing: '1px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🗑️ REPORTES CIUDADANOS A RECOLECTAR</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {reportesCiudadanos.map(r => {
              const resuelto = r.estado === 'resuelto';
              return (
                <div key={`reporte-card-${r.id}`} style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background: resuelto ? 'rgba(34,197,94,0.06)' : 'rgba(239, 68, 68, 0.08)',
                  border: `1px solid ${resuelto ? 'rgba(34,197,94,0.2)' : 'rgba(239, 68, 68, 0.3)'}`,
                  display: 'flex', flexDirection: 'column', gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: resuelto ? 'rgba(34,197,94,0.2)' : 'rgba(239, 68, 68, 0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px'
                    }}>
                      {resuelto ? <i className="bi bi-check-lg" style={{ color: '#22c55e' }}></i> : <i className="bi bi-exclamation-circle-fill" style={{ color: '#ef4444' }}></i>}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: resuelto ? '#9ca3af' : 'white', textDecoration: resuelto ? 'line-through' : 'none' }}>
                        {r.tipo_problema}
                      </div>
                      <div style={{ fontSize: '11px', color: resuelto ? '#6b7280' : '#d1d5db', marginTop: '2px', lineHeight: 1.4 }}>
                        {r.descripcion}
                      </div>
                      {r.nombre_ciudadano && (
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                          Reportado por: {r.nombre_ciudadano}
                        </div>
                      )}
                    </div>

                    {!resuelto && (
                      <button
                        onClick={() => onResolverReporte(r.id)}
                        style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#ef4444', color: 'white', fontWeight: 800, fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}
                      >
                        Recoger
                      </button>
                    )}
                  </div>

                  {r.foto_url && !resuelto && (
                    <div style={{ marginTop: '4px' }}>
                      <img 
                        src={getAssetUrl(r.foto_url)} 
                        alt="Evidencia punto crítico" 
                        style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab Novedades ───────────────────────────────────────────
const TIPOS = [
  { key: 'via_obstruida',      label: '🚧 Vía obstruida o acceso impedido' },
  { key: 'falla_motor',        label: '🔧 Falla de motor / Mecánica' },
  { key: 'accidente',          label: '💥 Accidente de tránsito' },
  { key: 'operario_lesionado', label: '🚑 Operario lesionado' },
  { key: 'otro',               label: '📋 Otro (describir)' },
];

export function TabNovedades({ asignacionId, conductorId, onReportarNovedad, isOnline }) {
  const [tipo, setTipo] = useState('');
  const [desc, setDesc] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [fueOffline, setFueOffline] = useState(false);
  const [respuestaIncidencia, setRespuestaIncidencia] = useState(null);

  const capturarUbicacion = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => { 
          console.warn("⚠️ Error GPS:", err); 
          resolve(null); 
        },
        { timeout: 7000, enableHighAccuracy: true }
      );
    });
  };

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    
    const ubicacion = await capturarUbicacion();
    const payload = {
      asignacion_id: asignacionId,
      conductor_id: conductorId,
      tipo,
      descripcion: desc,
      ...(ubicacion && { lat: ubicacion.lat, lng: ubicacion.lng })
    };

    let respuestaData = null;

    if (onReportarNovedad) {
      const res = await onReportarNovedad(payload);
      setFueOffline(res?.offline);
      respuestaData = res;
    } else {
      try {
        const res = await API.post('/incidencias', payload);
        setFueOffline(false);
        respuestaData = res.data;
      } catch (err) {
        console.error('Error al enviar novedad:', err.response?.data?.mensaje || err.message);
      }
    }
    
    setRespuestaIncidencia(respuestaData);
    setEnviando(false);
    setEnviado(true);

    if (!respuestaData?.telefono_emergencia) {
      setTimeout(() => { resetFormulario(); }, 3000);
    }
  };

  const resetFormulario = () => {
    setEnviado(false); setTipo(''); setDesc(''); setFueOffline(false); setRespuestaIncidencia(null);
  };

  if (enviado) {
    const requiereLlamada = !fueOffline && respuestaIncidencia?.telefono_emergencia;

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '20px' }}>
        
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: fueOffline ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)', border: `2px solid ${fueOffline ? '#F59E0B' : '#22c55e'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>
          {fueOffline ? '📶' : '✓'}
        </div>
        
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'white', textAlign: 'center' }}>
          {fueOffline ? 'Guardado sin conexión' : 'Reporte Enviado'}
        </div>

        {requiereLlamada && (
          <div style={{ marginTop: '16px', width: '100%', maxWidth: '300px' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '2px solid #ef4444', borderRadius: '12px', padding: '20px', textAlign: 'center', boxShadow: '0 8px 24px rgba(239, 68, 68, 0.2)' }}>
              
              <div style={{ fontSize: '14px', color: '#fca5a5', marginBottom: '16px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
                {tipo === 'operario_lesionado' ? '🚑 Emergencia Médica' : '🔧 Asistencia Vial'}
              </div>
              
              <a 
                href={`tel:${respuestaIncidencia.telefono_emergencia.replace(/\s+/g, '')}`} 
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  padding: '16px', background: '#ef4444', color: 'white', 
                  borderRadius: '8px', fontSize: '18px', fontWeight: 800, textDecoration: 'none',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)'
                }}
              >
                <i className="bi bi-telephone-fill"></i>
                Llamar Ahora
              </a>

              <div style={{ fontSize: '12px', color: '#fca5a5', marginTop: '16px', lineHeight: 1.4 }}>
                {tipo === 'operario_lesionado' 
                  ? 'El Administrador ya fue notificado. Llama a la ambulancia de inmediato.' 
                  : `Contacta a la grúa al ${respuestaIncidencia.telefono_emergencia}.`}
              </div>

            </div>

            <button onClick={resetFormulario} style={{ width: '100%', marginTop: '20px', padding: '12px', background: 'transparent', border: '1px solid #4b5563', color: '#9ca3af', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
              Volver al panel principal
            </button>
          </div>
        )}

        {!requiereLlamada && (
          <div style={{ fontSize: '13px', color: '#9ca3af', textAlign: 'center', marginTop: '8px' }}>
            {fueOffline ? 'Se enviará automáticamente cuando recuperes la conexión.' : 'El administrador fue notificado de inmediato y gestionará tu reporte.'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
      <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444', marginBottom: '4px' }}>⚠️ AVISO IMPORTANTE</div>
        <div style={{ fontSize: '12px', color: '#fca5a5' }}>Cualquier reporte que envíes será notificado de inmediato al administrador. Usa esta función solo para incidentes reales.</div>
      </div>

      <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'white', marginBottom: '4px' }}>Tipo de novedad</div>
        {TIPOS.map(t => (
          <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '10px', background: tipo === t.key ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${tipo === t.key ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer' }}>
            <input type="radio" name="tipo" value={t.key} checked={tipo === t.key} onChange={() => setTipo(t.key)} style={{ accentColor: '#22c55e' }} />
            <span style={{ fontSize: '13px', color: 'white' }}>{t.label}</span>
          </label>
        ))}

        {tipo && (
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Describe con más detalle la situación..."
            rows={3}
            required
            style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontFamily: 'Inter, sans-serif', fontSize: '13px', resize: 'none', outline: 'none' }}
          />
        )}

        <button
          type="submit"
          disabled={!tipo || enviando}
          style={{ padding: '14px', borderRadius: '10px', border: 'none', background: tipo ? '#ef4444' : '#374151', color: tipo ? 'white' : '#6b7280', fontWeight: 700, fontSize: '14px', cursor: tipo ? 'pointer' : 'not-allowed', marginTop: '4px' }}
        >
          {enviando ? '⏳ Capturando ubicación y enviando...' : '📡 Reportar novedad'}
        </button>
      </form>
    </div>
  );
}
