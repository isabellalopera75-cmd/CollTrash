import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Topbar() {
  const location = useLocation();
  const { usuario } = useAuth();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Dashboard';
    if (path === '/rutas') return 'Gestión Semanal';
    if (path === '/monitoreo') return 'Monitoreo en Vivo';
    if (path === '/conductores') return 'Conductores';
    if (path === '/reportes') return 'Reportes Ciudadanos';
    return 'CollTrash';
  };

  return (
    <header className="topbar">
      <div className="page-info">
        <p>Damas / <span style={{ color: 'var(--text-primary)' }}>Gestión de residuos CollTrash</span></p>
        <h1 style={{ marginTop: '4px' }}>{getPageTitle()}</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div className="status-badge status-active">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-primary)' }}></div>
          En vivo
        </div>
        
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          📅 {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>

        <div style={{ position: 'relative' }}>
          <span style={{ fontSize: '20px', cursor: 'pointer' }}>🔔</span>
          <div style={{ position: 'absolute', top: 0, right: 0, width: '12px', height: '12px', backgroundColor: 'var(--color-danger)', borderRadius: '50%', border: '2px solid var(--bg-global)', fontSize: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</div>
        </div>
      </div>
    </header>
  );
}
