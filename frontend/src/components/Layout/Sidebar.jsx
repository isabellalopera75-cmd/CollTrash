import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';

export default function Sidebar() {
  const { cerrarSesion, usuario } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const menuGroups = [
    {
      label: 'Principal',
      items: [
        { path: '/dashboard', label: 'Dashboard', icon: 'bi bi-grid-1x2-fill' },
        { path: '/monitoreo', label: 'Monitoreo en Vivo', icon: 'bi bi-geo-alt-fill' },
      ]
    },
    {
      label: 'Operaciones',
      items: [
        { path: '/rutas', label: 'Gestión Semanal', icon: 'bi bi-calendar-week' },
        { path: '/configurar-rutas', label: 'Configurar Rutas', icon: 'bi bi-gear-fill' },
        { path: '/puntos-descarga', label: 'Puntos de Descarga', icon: 'bi bi-pin-map-fill' },
        { path: '/conductores', label: 'Conductores', icon: 'bi bi-person-badge-fill' },
        { path: '/vehiculos', label: 'Vehículos', icon: 'bi bi-truck' },
        { path: '/reportes-operativos', label: 'Reportes Operativos', icon: 'bi bi-file-earmark-bar-graph-fill' },
      ]
    },
    {
      label: 'Comunidad',
      items: [
        { path: '/reportes', label: 'Reportes Ciudadanos', icon: 'bi bi-megaphone-fill' },
      ]
    },
    {
      label: 'Sistema',
      items: [
        { path: '/configuracion', label: 'Configuración', icon: 'bi bi-tools' },
        { path: '/historial', label: 'Historial', icon: 'bi bi-clock-history' },
      ]
    }
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-circle">C</div>
        {!collapsed && (
          <div className="logo-text">
            <div style={{ fontWeight: 700, fontSize: '14px' }}>CollTrash</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Neiva, Colombia</div>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {menuGroups.map((group, idx) => (
          <div key={idx}>
            {!collapsed && <div className="nav-group-label">{group.label}</div>}
            {group.items.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                title={collapsed ? item.label : ''}
              >
                <i className={item.icon} style={{ fontSize: '18px' }}></i>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer" style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="logo-circle" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--color-primary)', flexShrink: 0 }}>
            <i className="bi bi-person-fill" style={{ fontSize: '14px' }}></i>
          </div>
          {!collapsed && (
            <>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'white' }}>
                  {usuario?.nombre || 'Admin Principal'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {usuario?.email || 'admin@colltrash.co'}
                </div>
              </div>
              <button
                onClick={cerrarSesion}
                title="Cerrar sesión"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', padding: '4px', borderRadius: '6px', transition: 'color 0.2s', flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-danger)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <i className="bi bi-box-arrow-right"></i>
              </button>
            </>
          )}
          {collapsed && (
            <button onClick={cerrarSesion} title="Cerrar sesión" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', padding: '4px' }}>
              <i className="bi bi-box-arrow-right"></i>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
