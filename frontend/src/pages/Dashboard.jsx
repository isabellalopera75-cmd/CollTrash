import { useState, useEffect } from 'react';
import AdminLayout from '../components/Layout/AdminLayout';
import { dashboardDiario } from '../services/api';
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
    completadas: 0,
    activas: 0,
    reportesPendientes: 0,
    toneladasHoy: 0,
    kmHoy: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await dashboardDiario();
        const d = res.data;
        setStats({
          rutasHoy: d.rutas.total_programadas,
          completadas: parseInt(d.rutas.completadas || 0),
          activas: parseInt(d.rutas.activas || 0),
          reportesPendientes: d.reportes_pendientes,
          toneladasHoy: parseFloat(d.eficiencia.toneladas_totales || 0).toFixed(1),
          kmHoy: parseFloat(d.eficiencia.km_totales || 0).toFixed(1)
        });
      } catch (e) { 
        console.error('Error cargando stats:', e); 
      }
    };
    fetchData();
  }, []);

  // Gráfica Doughnut (Estado de Rutas)
  const doughnutData = {
    labels: ['Completadas', 'En Curso', 'Pendientes'],
    datasets: [{
      data: [stats.completadas, stats.activas, Math.max(0, stats.rutasHoy - stats.completadas - stats.activas)],
      backgroundColor: ['#00ff9d', '#ffcc00', '#333'],
      borderWidth: 0,
    }]
  };

  // Gráfica de Barras (Muestra representativa)
  const barData = {
    labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    datasets: [{
      label: 'Toneladas',
      data: [12, 19, 15, 17, 22, 14, 0],
      backgroundColor: 'rgba(0, 255, 157, 0.6)',
      borderRadius: 8,
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#888', font: { size: 10 } } }
    },
    scales: {
      y: { display: false },
      x: { grid: { display: false }, ticks: { color: '#888' } }
    }
  };

  const s = {
    card: { background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' },
    title: { fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' },
    value: { fontSize: '32px', fontWeight: 800, color: 'white' }
  };

  // Cálculo de ahorro/combustible estimado (Simulado)
  const combustibleEstimado = (stats.kmHoy * 0.15).toFixed(1); // 0.15 galones por km

  return (
    <AdminLayout>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: 700, color: 'white' }}>Panel de Control</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Métricas operacionales en tiempo real</p>
      </div>

      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={s.card}>
          <div style={s.title}>Rutas de Hoy</div>
          <div style={s.value}>{stats.rutasHoy}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-primary)', marginTop: '8px' }}>
            {stats.completadas} finalizadas con éxito
          </div>
        </div>
        <div style={{ ...s.card, borderTop: '4px solid #ffcc00' }}>
          <div style={s.title}>Carga Recolectada</div>
          <div style={s.value}>{stats.toneladasHoy} <span style={{ fontSize: '16px' }}>t</span></div>
          <div style={{ fontSize: '11px', color: '#ffcc00', marginTop: '8px' }}>Total reportado por conductores</div>
        </div>
        <div style={{ ...s.card, borderTop: '4px solid #00c2ff' }}>
          <div style={s.title}>Distancia Total</div>
          <div style={s.value}>{stats.kmHoy} <span style={{ fontSize: '16px' }}>km</span></div>
          <div style={{ fontSize: '11px', color: '#00c2ff', marginTop: '8px' }}>Consumo est.: {combustibleEstimado} Gal</div>
        </div>
        <div style={{ ...s.card, borderTop: '4px solid #ff4444' }}>
          <div style={s.title}>Novedades</div>
          <div style={s.value}>{stats.reportesPendientes}</div>
          <div style={{ fontSize: '11px', color: '#ff4444', marginTop: '8px' }}>Reportes ciudadanos pendientes</div>
        </div>
      </div>

      {/* GRÁFICOS */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <div style={s.card}>
          <h4 style={{ marginBottom: '20px', fontWeight: 600 }}>Rendimiento Semanal (Toneladas)</h4>
          <div style={{ height: '300px' }}>
            <Bar data={barData} options={chartOptions} />
          </div>
        </div>
        <div style={s.card}>
          <h4 style={{ marginBottom: '20px', fontWeight: 600 }}>Estado de Jornada</h4>
          <div style={{ height: '240px' }}>
            <Doughnut data={doughnutData} options={{ ...chartOptions, cutout: '70%' }} />
          </div>
          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
             Rutas procesadas: {Math.round((stats.completadas / stats.rutasHoy) * 100) || 0}%
          </div>
        </div>
      </div>

      {/* SECCIÓN DE MEJORES CONDUCTORES (SUGERENCIA) */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h4 style={{ fontWeight: 600 }}>Ranking de Eficiencia (Conductores)</h4>
          <span style={{ fontSize: '12px', color: 'var(--color-primary)', cursor: 'pointer' }}>Ver todo</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
           {[
             { n: 'Josué Cárdenas', e: 98, t: 12.4 },
             { n: 'Felipe Pérez', e: 95, t: 10.1 },
             { n: 'Marcos Rivas', e: 88, t: 9.8 }
           ].map((c, i) => (
             <div key={i} style={{ padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #222' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                   <span style={{ fontSize: '14px', fontWeight: 600 }}>{c.n}</span>
                   <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{c.e}%</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.t} Toneladas hoy</div>
             </div>
           ))}
        </div>
      </div>
    </AdminLayout>
  );
}