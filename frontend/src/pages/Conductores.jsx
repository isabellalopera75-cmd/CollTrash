import { useState, useEffect } from 'react';
import API, { registrarConductor, editarConductor } from '../services/api';
import AdminLayout from '../components/Layout/AdminLayout';

export default function Conductores() {
  const [conductores, setConductores] = useState([]);
  const [form, setForm] = useState({ nombre: '', email: '', password: '', cedula: '', telefono: '' });
  const [mostrarModal, setMostrarModal] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => { cargarConductores(); }, []);

  const cargarConductores = async () => {
    try {
      const res = await API.get('/auth/conductores');
      setConductores(res.data.conductores || []);
    } catch (error) {
      console.error('Error al obtener conductores:', error);
    } finally {
      setCargando(false);
    }
  };

  const handleAbrirModal = (c = null) => {
    if (c) {
      setEditandoId(c.id);
      setForm({ nombre: c.nombre, email: c.email, password: '', cedula: c.cedula || '', telefono: c.telefono || '' });
    } else {
      setEditandoId(null);
      setForm({ nombre: '', email: '', password: '', cedula: '', telefono: '' });
    }
    setMostrarModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (form.telefono.length !== 10) {
      return alert('⚠️ El teléfono debe tener exactamente 10 dígitos.');
    }

    try {
      if (editandoId) {
        await editarConductor(editandoId, form);
      } else {
        await registrarConductor(form);
      }
      setMostrarModal(false);
      cargarConductores();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.mensaje || 'No se pudo procesar'));
    }
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>
             <i className="bi bi-people-fill" style={{ marginRight: '12px', color: 'var(--color-primary)' }}></i>
             Gestión de Conductores
           </h2>
           <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Administración del personal operativo de CollTrash</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleAbrirModal()}>
          <i className="bi bi-plus-lg" style={{ marginRight: '8px' }}></i>
          Nuevo Conductor
        </button>
      </div>

      <div className="data-table-container">
        <div className="data-table-header" style={{ gridTemplateColumns: '2fr 2fr 1fr 1fr' }}>
           <span>NOMBRE</span>
           <span>CONTACTO</span>
           <span>ESTADO</span>
           <span style={{ textAlign: 'right' }}>ACCIONES</span>
        </div>
        <div>
          {cargando ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando personal...</div>
          ) : conductores.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay conductores registrados.</div>
          ) : conductores.map(c => (
            <div key={c.id} className="data-table-row" style={{ gridTemplateColumns: '2fr 2fr 1fr 1fr' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div className="logo-circle" style={{ background: 'var(--bg-secondary)', color: 'var(--color-primary)' }}>
                    <i className="bi bi-person-fill"></i>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'white' }}>{c.nombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>CC: {c.cedula || 'N/A'}</div>
                  </div>
               </div>
               <div>
                  <div style={{ fontSize: '13px', color: 'white' }}>{c.email}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.telefono || 'Sin teléfono'}</div>
               </div>
               <div>
                  <span className={`status-badge ${c.activo ? 'status-active' : 'status-danger'}`}>
                    {c.activo ? 'ACTIVO' : 'INACTIVO'}
                  </span>
               </div>
               <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => handleAbrirModal(c)} className="icon-btn" title="Editar">
                    <i className="bi bi-pencil-square"></i>
                  </button>
                  <button className="icon-btn" title="Cambiar Estado">
                    <i className="bi bi-arrow-repeat"></i>
                  </button>
               </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Conductor */}
      {mostrarModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '520px', border: '1px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', color: 'white' }}>
                <i className={`bi ${editandoId ? 'bi-pencil' : 'bi-person-plus'}`} style={{ marginRight: '10px', color: 'var(--color-primary)' }}></i>
                {editandoId ? 'Editar Conductor' : 'Nuevo Conductor'}
              </h3>
              <button onClick={() => setMostrarModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px' }}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Nombre Completo</label>
                <input 
                  type="text" 
                  required 
                  value={form.nombre} 
                  className="card" 
                  style={{ width: '100%', background: 'var(--bg-secondary)', border: 'none', color: 'white', padding: '12px' }} 
                  onChange={e => setForm({...form, nombre: e.target.value.replace(/[0-9]/g, '')})} 
                  placeholder="Ej. Juan Pérez" 
                />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Correo Electrónico</label>
                <input type="email" required value={form.email} className="card" style={{ width: '100%', background: 'var(--bg-secondary)', border: 'none', color: 'white', padding: '12px' }} onChange={e => setForm({...form, email: e.target.value})} placeholder="conductor@colltrash.com" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Cédula</label>
                <input 
                  type="text" 
                  required
                  value={form.cedula} 
                  className="card" 
                  style={{ width: '100%', background: 'var(--bg-secondary)', border: 'none', color: 'white', padding: '12px' }} 
                  onChange={e => setForm({...form, cedula: e.target.value.replace(/[^0-9]/g, '')})} 
                  placeholder="1234567890" 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Teléfono</label>
                <input 
                  type="text" 
                  required
                  value={form.telefono} 
                  className="card" 
                  style={{ width: '100%', background: 'var(--bg-secondary)', border: 'none', color: 'white', padding: '12px' }} 
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    if (val.length <= 10) setForm({...form, telefono: val});
                  }} 
                  placeholder="3100000000" 
                />
                <span style={{ fontSize: '10px', color: form.telefono.length === 10 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                  {form.telefono.length}/10 dígitos
                </span>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Contraseña {editandoId && <span style={{ color: 'var(--color-warning)', fontStyle: 'italic' }}>(dejar vacío para no cambiar)</span>}
                </label>
                <input type="password" required={!editandoId} value={form.password} className="card" style={{ width: '100%', background: 'var(--bg-secondary)', border: 'none', color: 'white', padding: '12px' }} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" />
              </div>
              <button type="submit" className="btn btn-primary" style={{ gridColumn: '1/-1', padding: '14px', fontWeight: 700, marginTop: '8px' }}>
                {editandoId ? 'Guardar Cambios' : 'Registrar Conductor'}
              </button>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}