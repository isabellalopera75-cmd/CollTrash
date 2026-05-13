import { useState, useEffect } from 'react';
import { obtenerVehiculos, crearVehiculo, editarVehiculo } from '../services/api';
import AdminLayout from '../components/Layout/AdminLayout';

export default function Vehiculos() {
  const [vehiculos, setVehiculos] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({ placa: '', modelo: '', capacidad_ton: '' });
  const [cargando, setCargando] = useState(true);

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    try {
      const res = await obtenerVehiculos();
      setVehiculos(res.data.vehiculos || []);
    } catch (e) { console.error(e); }
    finally { setCargando(false); }
  };

  const handleAbrirModal = (v = null) => {
    if (v) {
      setEditandoId(v.id);
      setForm({ placa: v.placa, modelo: v.modelo, capacidad_ton: v.capacidad_ton });
    } else {
      setEditandoId(null);
      setForm({ placa: '', modelo: '', capacidad_ton: '' });
    }
    setMostrarModal(true);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();

    // Validar placa (AAA-123)
    const regexPlaca = /^[A-Z]{3}-[0-9]{3}$/;
    if (!regexPlaca.test(form.placa.toUpperCase())) {
      return alert('⚠️ La placa debe tener el formato AAA-123 (3 letras, guión y 3 números).');
    }

    if (parseFloat(form.capacidad_ton) <= 0) {
      return alert('⚠️ La capacidad debe ser mayor a 0.');
    }

    try {
      if (editandoId) {
        await editarVehiculo(editandoId, {...form, placa: form.placa.toUpperCase()});
      } else {
        await crearVehiculo({...form, placa: form.placa.toUpperCase()});
      }
      setMostrarModal(false);
      cargarDatos();
    } catch (error) {
      console.error(error);
      alert('❌ Error: ' + (error.response?.data?.mensaje || 'No se pudo procesar'));
    }
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>
             <i className="bi bi-truck" style={{ marginRight: '12px', color: 'var(--color-primary)' }}></i>
             Gestión de Vehículos
           </h2>
           <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Control de la flota de recolección CollTrash</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleAbrirModal()}>
          <i className="bi bi-plus-lg" style={{ marginRight: '8px' }}></i>
          Nuevo Vehículo
        </button>
      </div>

      <div className="data-table-container">
        <div className="data-table-header" style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr' }}>
           <span>PLACA</span>
           <span>DETALLES</span>
           <span>CAPACIDAD</span>
           <span style={{ textAlign: 'right' }}>ACCIONES</span>
        </div>
        <div>
          {cargando ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>Cargando flota...</div>
          ) : vehiculos.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay vehículos registrados.</div>
          ) : vehiculos.map(v => (
            <div key={v.id} className="data-table-row" style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div className="logo-circle" style={{ background: 'var(--bg-secondary)', color: 'var(--color-primary)', fontSize: '14px' }}>
                    <i className="bi bi-truck-flatbed"></i>
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '1px' }}>{v.placa}</span>
               </div>
               <span style={{ fontSize: '14px', color: 'white' }}>{v.modelo}</span>
               <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'white' }}>{v.capacidad_ton} Ton</span>
                  <div style={{ flex: 1, height: '4px', background: '#333', borderRadius: '2px', minWidth: '60px' }}>
                    <div style={{ width: `${Math.min((v.capacidad_ton/10)*100, 100)}%`, height: '100%', background: 'var(--color-primary)', borderRadius: '2px' }}></div>
                  </div>
               </div>
               <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => handleAbrirModal(v)} className="icon-btn" title="Editar">
                    <i className="bi bi-pencil-square"></i>
                  </button>
                  <button className="icon-btn icon-btn-danger" title="Eliminar">
                    <i className="bi bi-trash3-fill"></i>
                  </button>
               </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Vehículo */}
      {mostrarModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '460px', border: '1px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', color: 'white' }}>
                <i className={`bi ${editandoId ? 'bi-pencil' : 'bi-truck'}`} style={{ marginRight: '10px', color: 'var(--color-primary)' }}></i>
                {editandoId ? 'Editar Vehículo' : 'Nuevo Vehículo'}
              </h3>
              <button onClick={() => setMostrarModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px' }}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleGuardar} style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Placa del Vehículo</label>
                <input 
                  type="text" 
                  required 
                  value={form.placa} 
                  className="card" 
                  style={{ width: '100%', background: 'var(--bg-secondary)', border: 'none', color: 'white', padding: '12px', letterSpacing: '2px', fontWeight: 700 }} 
                  onChange={e => {
                    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (val.length > 6) val = val.substring(0, 6);
                    
                    let formatted = '';
                    if (val.length <= 3) {
                      formatted = val.replace(/[^A-Z]/g, '');
                    } else {
                      const letters = val.substring(0, 3).replace(/[^A-Z]/g, '');
                      const numbers = val.substring(3).replace(/[^0-9]/g, '');
                      if (letters.length === 3) {
                        formatted = letters + '-' + numbers;
                      } else {
                        formatted = letters; // Bloquea si no hay 3 letras primero
                      }
                    }
                    setForm({...form, placa: formatted});
                  }} 
                  placeholder="ABC-123" 
                  maxLength={7}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Modelo / Marca</label>
                <input type="text" required value={form.modelo} className="card" style={{ width: '100%', background: 'var(--bg-secondary)', border: 'none', color: 'white', padding: '12px' }} onChange={e => setForm({...form, modelo: e.target.value})} placeholder="Camión Compactador Kenworth" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Capacidad de Carga (Toneladas)</label>
                <input type="number" step="0.1" required value={form.capacidad_ton} className="card" style={{ width: '100%', background: 'var(--bg-secondary)', border: 'none', color: 'white', padding: '12px' }} onChange={e => setForm({...form, capacidad_ton: e.target.value})} placeholder="5.5" />
              </div>
              <button type="submit" className="btn btn-primary" style={{ padding: '14px', marginTop: '8px', fontWeight: 700 }}>
                {editandoId ? 'Guardar Cambios' : 'Registrar Vehículo'}
              </button>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
