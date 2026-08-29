import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import API from '../../services/api';

export default function GestionIncidenciaModal({ incidenciaId, onClose, onResolved }) {
  const [incidencia, setIncidencia] = useState(null);
  const [resolucionForm, setResolucionForm] = useState({ resolucion: '', nuevo_conductor_id: '', nuevo_vehiculo_id: '', eta_minutos: '' });
  const [telefonos, setTelefonos] = useState({ telefono_grua: '', telefono_ambulancia: '' });
  const [recursosLibres, setRecursosLibres] = useState({ conductores: [], vehiculos: [] });
  const [cargandoRecursos, setCargandoRecursos] = useState(false);
  const [loadingIncidencia, setLoadingIncidencia] = useState(true);

  useEffect(() => {
    if (incidenciaId) {
      cargarDatos(incidenciaId);
    }
  }, [incidenciaId]);

  const cargarDatos = async (id) => {
    setLoadingIncidencia(true);
    try {
      // Usaremos un endpoint para obtener los datos de la incidencia (podemos reusar /incidencias y filtrar, o buscar de incidencias activas)
      const res = await API.get('/incidencias');
      const found = res.data.incidencias?.find(i => i.id.toString() === id.toString());
      
      if (!found) {
        alert("La incidencia ya fue resuelta o no existe.");
        onClose();
        return;
      }
      
      setIncidencia(found);
      
      if (found.tipo === 'operario_lesionado' || found.tipo === 'falla_motor' || found.tipo === 'accidente') {
        try {
          const resTel = await API.get('/config/telefonos');
          setTelefonos(resTel.data.telefonos);
        } catch (e) { console.error('Error cargando teléfonos', e); }
      }

      if (found.tipo === 'falla_motor' || found.tipo === 'accidente' || found.tipo === 'operario_lesionado') {
        setCargandoRecursos(true);
        try {
          const resRec = await API.get('/rutas/recursos-libres');
          setRecursosLibres(resRec.data);
        } catch (e) { console.error('Error cargando recursos', e); }
        finally { setCargandoRecursos(false); }
      }
    } catch(e) {
      console.error(e);
      alert("Error al cargar la incidencia.");
      onClose();
    } finally {
      setLoadingIncidencia(false);
    }
  };

  const submitResolucion = async (e) => {
    e.preventDefault();
    try {
      await API.put(`/incidencias/${incidencia.id}/resolver`, resolucionForm);
      const descartadas = JSON.parse(localStorage.getItem('colltrash_incidencias_descartadas') || '[]');
      localStorage.setItem('colltrash_incidencias_descartadas', JSON.stringify(descartadas.filter(id => id !== incidencia.id)));
      
      if (onResolved) onResolved(incidencia.id);
      onClose();
    } catch(err) {
      alert('Error al resolver la incidencia. Verifica los campos.');
    }
  };

  if (!incidenciaId) return null;

  return createPortal(
    // tema-oscuro: esta ventana se monta con createPortal sobre <body>, fuera de
    // .admin-shell, de modo que no heredaba la paleta oscura del panel y salia
    // en blanco sobre una interfaz oscura. La clase le da ese mismo ambito.
    <div className="tema-oscuro" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999, padding: '20px' }}>
      <div className="card" style={{ width: '450px', maxWidth: '100%', border: '1px solid var(--borde)', background: 'var(--superficie)', color: 'var(--texto)', padding: '24px', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sombra-3)', maxHeight: '90vh', overflowY: 'auto' }}>
        {loadingIncidencia ? (
           <div style={{ padding: '40px', textAlign: 'center', color: 'var(--texto)' }}>Cargando datos de la incidencia...</div>
        ) : !incidencia ? null : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', color: 'var(--texto)', textTransform: 'capitalize', margin: 0 }}>
                Gestionar: {incidencia.tipo.replace('_', ' ')}
              </h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--texto)', cursor: 'pointer' }}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <form onSubmit={submitResolucion} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* CASO 1: operario_lesionado */}
              {incidencia.tipo === 'operario_lesionado' && (
                <div style={{ background: 'var(--peligro-suave)', border: '1px solid var(--peligro)', padding: '15px', borderRadius: '8px', textAlign: 'center', marginBottom: '8px' }}>
                  <i className="bi bi-telephone-outbound-fill" style={{ fontSize: '24px', color: 'var(--peligro)' }}></i>
                  <h4 style={{ color: 'var(--peligro)', margin: '10px 0 5px' }}>Ambulancia: {telefonos.telefono_ambulancia || 'Cargando...'}</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Contacta a emergencias inmediatamente.</p>
                </div>
              )}

              {/* CASO 2: falla_motor o accidente */}
              {(incidencia.tipo === 'falla_motor' || incidencia.tipo === 'accidente') && (
                <div style={{ background: 'var(--alerta-suave)', border: '1px solid var(--alerta)', padding: '12px', borderRadius: '8px', textAlign: 'center', marginBottom: '8px' }}>
                  <i className="bi bi-truck" style={{ fontSize: '20px', color: 'var(--alerta)' }}></i>
                  <h4 style={{ color: 'var(--alerta)', margin: '5px 0' }}>Grúa de Rescate: {telefonos.telefono_grua || 'Cargando...'}</h4>
                </div>
              )}

              {(incidencia.tipo === 'falla_motor' || incidencia.tipo === 'accidente' || incidencia.tipo === 'operario_lesionado') && (
                <>
                  {cargandoRecursos ? <p style={{ fontSize: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>Buscando personal y vehículos libres...</p> : (
                    <>
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>1. Conductor de Relevo {incidencia.tipo === 'operario_lesionado' ? '(Opcional)' : ''}</label>
                        <select required={incidencia.tipo !== 'operario_lesionado'} value={resolucionForm.nuevo_conductor_id} onChange={e => setResolucionForm({...resolucionForm, nuevo_conductor_id: e.target.value})} className="card" style={{ width: '100%', padding: '10px', marginTop: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--texto)' }}>
                          <option value="">Selecciona conductor libre...</option>
                          {recursosLibres.conductores
                            .filter(c => c.id !== incidencia.conductor_id)
                            .map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>2. Vehículo de Reemplazo {incidencia.tipo === 'operario_lesionado' ? '(Opcional)' : ''}</label>
                        <select required={incidencia.tipo !== 'operario_lesionado'} value={resolucionForm.nuevo_vehiculo_id} onChange={e => setResolucionForm({...resolucionForm, nuevo_vehiculo_id: e.target.value})} className="card" style={{ width: '100%', padding: '10px', marginTop: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--texto)' }}>
                          <option value="">Selecciona vehículo libre...</option>
                          {recursosLibres.vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa} ({v.capacidad_ton} Ton)</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>3. ETA Estimado de Rescate (Minutos) {incidencia.tipo === 'operario_lesionado' ? '(Opcional)' : ''}</label>
                        <input required={incidencia.tipo !== 'operario_lesionado'} type="number" value={resolucionForm.eta_minutos} onChange={e => setResolucionForm({...resolucionForm, eta_minutos: e.target.value})} className="card" style={{ width: '100%', padding: '10px', marginTop: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--texto)' }} placeholder="Ej: 15" />
                      </div>
                    </>
                  )}
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '10px', fontWeight: 'bold', background: incidencia.tipo === 'operario_lesionado' ? 'var(--peligro)' : 'var(--color-primary)', border: 'none' }}>
                    {incidencia.tipo === 'operario_lesionado' ? (resolucionForm.nuevo_conductor_id ? 'Despachar Relevo, Ambulancia y Cerrar' : 'Marcar como Ambulancia Gestionada') : 'Asignar Relevo y Cerrar Incidencia'}
                  </button>
                </>
              )}

              {/* CASO 3: via_obstruida u otro */}
              {incidencia.tipo !== 'operario_lesionado' && incidencia.tipo !== 'falla_motor' && incidencia.tipo !== 'accidente' && (
                <>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Nota de Resolución (Opcional)</label>
                    <textarea value={resolucionForm.resolucion} onChange={e => setResolucionForm({...resolucionForm, resolucion: e.target.value})} className="card" style={{ width: '100%', padding: '10px', marginTop: '4px', minHeight: '80px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--texto)' }} placeholder="Ej: Se le indicó al conductor tomar la calle alterna..." />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontWeight: 'bold' }}>
                    Cerrar Incidencia
                  </button>
                </>
              )}

            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
