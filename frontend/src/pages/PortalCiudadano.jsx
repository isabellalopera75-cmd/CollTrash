import { useState, useEffect } from 'react';
import { crearReporteCiudadano, obtenerBarrios, detectarBarrio } from '../services/api';

export default function PortalCiudadano() {
  const [paso, setPaso] = useState(1);
  const [seccion, setSeccion] = useState('inicio');
  const [barrios, setBarrios] = useState([]);
  const [barrioSeleccionado, setBarrioSeleccionado] = useState(null);
  const [ubicacion, setUbicacion] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const [formReporte, setFormReporte] = useState({
    nombre_ciudadano: '',
    tipo_problema: '',
    descripcion: '',
    foto_url: ''
  });

  useEffect(() => {
    // Cargar barrios siempre al inicio
    cargarBarrios();

    // Capturar token si viene de Google
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('token', token);
      setPaso(2); // Ir al paso de GPS/Ubicación
      window.history.replaceState({}, document.title, "/portal");
    }
  }, []);

  const cargarBarrios = async () => {
    try {
      const res = await obtenerBarrios();
      setBarrios(res.data.barrios || []);
    } catch (error) {
      console.error('Error cargando barrios:', error);
      alert('Error de conexión: ' + (error.response?.data?.mensaje || error.message));
    }
  };

  const handleLoginGoogle = () => {
    // Simulación de OAuth por ahora, avanzamos al permiso
    setPaso(2);
  };

  const solicitarUbicacion = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        setUbicacion({ lat: latitude, lng: longitude });
        try {
          const res = await detectarBarrio(latitude, longitude);
          if (res.data.barrio) setBarrioSeleccionado(res.data.barrio);
        } catch (e) {}
        setPaso(3);
      }, () => {
        alert('Permiso denegado. Selecciona tu barrio manualmente.');
        setPaso(3);
      });
    }
  };

  const handleEnviarReporte = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const payload = {
        ...formReporte,
        latitud: ubicacion?.lat || 2.9273,
        longitud: ubicacion?.lng || -75.2819,
        barrio_id: barrioSeleccionado?.id
      };
      await crearReporteCiudadano(payload);
      alert('✅ Tu reporte ha sido enviado. El administrador lo revisará pronto.');
      setSeccion('inicio');
    } catch (error) {
      alert('❌ Error al enviar reporte');
    } finally {
      setEnviando(false);
    }
  };

  if (paso < 4) {
    return (
      <div className="onboarding-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-global)' }}>
        <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
          {paso === 1 && (
            <>
              <h2 style={{ marginBottom: '1rem' }}>🌿 CollTrash Ciudadano</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Reporta puntos de basura y ayuda a limpiar Neiva.</p>
              <button onClick={handleLoginGoogle} className="btn btn-primary" style={{ width: '100%' }}>Ingresar con Google</button>
            </>
          )}
          {paso === 2 && (
            <>
              <h2>📍 Necesitamos tu ubicación</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Para saber en qué ruta incluir tu reporte.</p>
              <button onClick={solicitarUbicacion} className="btn btn-primary" style={{ width: '100%', marginBottom: '10px' }}>Activar GPS</button>
              <button onClick={() => setPaso(3)} className="btn" style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>Seleccionar manualmente</button>
            </>
          )}
          {paso === 3 && (
            <>
              <h2>🏘️ Confirma tu Barrio</h2>
              <select 
                className="btn" 
                style={{ width: '100%', marginBottom: '1rem', background: 'var(--bg-secondary)', color: 'white', border: '1px solid var(--border-color)' }}
                onChange={(e) => setBarrioSeleccionado(barrios.find(b => b.id == e.target.value))}
              >
                <option value="">{barrios.length > 0 ? 'Selecciona tu barrio...' : 'Cargando barrios...'}</option>
                {barrios.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
              {barrios.length === 0 && (
                <button onClick={cargarBarrios} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '12px', cursor: 'pointer', marginBottom: '10px' }}>
                  🔄 Reintentar cargar barrios
                </button>
              )}
              <button onClick={() => setPaso(4)} className="btn btn-primary" style={{ width: '100%' }} disabled={!barrioSeleccionado}>Comenzar</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-global)', color: 'white' }}>
      <header style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', textAlign: 'center' }}>
        <h1 style={{ fontSize: '18px' }}>CollTrash Ciudadano</h1>
        <p style={{ fontSize: '12px', color: 'var(--color-primary)' }}>📍 {barrioSeleccionado?.nombre}</p>
      </header>

      <main style={{ padding: '20px' }}>
        {seccion === 'inicio' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <div className="card" style={{ background: 'var(--bg-secondary)', border: 'none' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Próxima recolección</p>
              <h2 style={{ color: 'var(--color-primary)' }}>Mañana 8:00 AM</h2>
            </div>
            <button onClick={() => setSeccion('reportar')} className="btn btn-primary" style={{ padding: '20px', fontSize: '16px' }}>
              📢 Reportar Punto Crítico
            </button>
          </div>
        )}

        {seccion === 'reportar' && (
          <form onSubmit={handleEnviarReporte} className="card" style={{ display: 'grid', gap: '16px' }}>
            <h3>Nuevo Reporte</h3>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tu Nombre</label>
              <input 
                type="text" 
                required 
                style={{ width: '100%', padding: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '8px' }}
                onChange={e => setFormReporte({...formReporte, nombre_ciudadano: e.target.value})}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>¿Qué problema hay?</label>
              <select 
                required 
                style={{ width: '100%', padding: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '8px' }}
                onChange={e => setFormReporte({...formReporte, tipo_problema: e.target.value})}
              >
                <option value="">Selecciona...</option>
                <option value="Acumulación de basura">Acumulación de basura</option>
                <option value="Escombros">Escombros</option>
                <option value="Contenedor lleno">Contenedor lleno</option>
                <option value="Mal olor">Mal olor</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Foto del Problema (URL)</label>
              <input 
                type="text" 
                placeholder="https://imagen.com/foto.jpg"
                style={{ width: '100%', padding: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '8px' }}
                onChange={e => setFormReporte({...formReporte, foto_url: e.target.value})}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={enviando} style={{ marginTop: '10px' }}>
              {enviando ? 'Enviando...' : '🚀 Enviar Reporte'}
            </button>
            <button type="button" onClick={() => setSeccion('inicio')} className="btn" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
          </form>
        )}
      </main>
    </div>
  );
}
