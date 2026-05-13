import { useState, useEffect } from 'react';
import AdminLayout from '../components/Layout/AdminLayout';
import { obtenerRutas, obtenerReportes } from '../services/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export default function Dashboard() {
  const [stats, setStats] = useState({
    rutasHoy: 0,
    reportesPendientes: 0,
    toneladasHoy: 12.5,
    kmHoy: 84.2
  });

  useEffect(() => {
    // Simular carga de datos reales
    const fetchData = async () => {
      try {
        const [r, rep] = await Promise.all([obtenerRutas(), obtenerReportes()]);
        setStats(prev => ({
          ...prev,
          rutasHoy: r.data.rutas.length,
          reportesPendientes: rep.data.reportes.filter(x => x.estado === 'pendiente').length
        }));
      } catch (e) { console.error(e); }
    };
    fetchData();
  }, []);

  // Configuración de Gráfica de Barras (Toneladas Semanales)
  const barData = {
    labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    datasets: [{
      label: 'Toneladas Recolectadas',
      data: [12, 19, 15, 17, 22, 14, 0],
      backgroundColor: 'rgba(0, 255, 157, 0.6)',
      borderColor: 'var(--color-primary)',
      borderWidth: 1,
      borderRadius: 5,
    }]
  };

  // Configuración de Gráfica de Líneas (Km Mensuales)
  const lineData = {
    labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
    datasets: [{
      label: 'Kilómetros Recorridos',
      data: [450, 520, 480, 600],
      fill: true,
      backgroundColor: 'rgba(0, 255, 157, 0.1)',
      borderColor: 'var(--color-primary)',
      tension: 0.4,
    }]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { 
        backgroundColor: '#1a1d23',
        titleColor: '#fff',
        bodyColor: '#00ff9d',
        borderColor: '#333',
        borderWidth: 1 
      }
    },
    scales: {
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
      x: { grid: { display: false }, ticks: { color: '#888' } }
    }
  };

  return (
    <AdminLayout>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'white' }}>
          <i className="bi bi-graph-up-arrow" style={{ marginRight: '12px', color: 'var(--color-primary)' }}></i>
          Resumen Operativo
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Panel de control y métricas de CollTrash</p>
      </div>

      {/* Tarjetas Superiores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div className="card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Rutas Activas Hoy</div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: 'white' }}>{stats.rutasHoy}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-primary)', marginTop: '5px' }}>↑ 12% vs ayer</div>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #ffcc00' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Reportes Pendientes</div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: 'white' }}>{stats.reportesPendientes}</div>
          <div style={{ fontSize: '11px', color: '#ffcc00', marginTop: '5px' }}>Requieren atención inmediata</div>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #00c2ff' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Toneladas Totales</div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: 'white' }}>{stats.toneladasHoy} t</div>
          <div style={{ fontSize: '11px', color: '#00c2ff', marginTop: '5px' }}>Promedio diario estable</div>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #ff4444' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Km Recorridos</div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: 'white' }}>{stats.kmHoy} km</div>
          <div style={{ fontSize: '11px', color: '#ff4444', marginTop: '5px' }}>Consumo de combustible optimizado</div>
        </div>
      </div>

      {/* Gráficas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h4 style={{ fontWeight: 600 }}>Recolección Semanal (Toneladas)</h4>
            <select style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '12px' }}>
              <option>Esta semana</option>
              <option>Semana pasada</option>
            </select>
          </div>
          <div style={{ height: '300px' }}>
            <Bar data={barData} options={chartOptions} />
          </div>
        </div>

        <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div>
            <i className="bi bi-search" style={{ fontSize: '40px', color: 'var(--text-muted)', display: 'block', marginBottom: '10px' }}></i>
            <p style={{ color: 'var(--text-muted)' }}>No hay datos suficientes para mostrar más detalles hoy.</p>
          </div>
        </div>
      </div>

      {/* Tabla rápida de efectividad */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h4 style={{ fontWeight: 600, marginBottom: '15px' }}>
          <i className="bi bi-check2-circle" style={{ marginRight: '8px' }}></i>
          Estado de Sectores (Hoy)
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 0', borderBottom: '1px solid #333', fontSize: '12px', color: 'var(--text-muted)' }}>
          <span>SECTOR / RUTA</span>
          <span>ESTADO</span>
          <span>PROGRESO</span>
        </div>
        <div style={{ padding: '15px 0', borderBottom: '1px solid #222', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', alignItems: 'center' }}>
          <span style={{ fontSize: '14px' }}>Ruta Norte - Sector 01</span>
          <span className="status-badge status-active">COMPLETADO</span>
          <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>100%</span>
        </div>
        <div style={{ padding: '15px 0', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', alignItems: 'center' }}>
          <span style={{ fontSize: '14px' }}>Ruta Sur - Sector A</span>
          <span className="status-badge status-warning">EN CURSO</span>
          <span style={{ color: '#ffcc00', fontWeight: 600 }}>65%</span>
        </div>
      </div>
    </AdminLayout>
  );
}