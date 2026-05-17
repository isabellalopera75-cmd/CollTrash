import { useState, useEffect } from 'react';
import AdminLayout from '../components/Layout/AdminLayout';
import { obtenerReporteEficiencia } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ReportesOperativos() {
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    inicio: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    fin: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const res = await obtenerReporteEficiencia(filtros.inicio, filtros.fin);
      setReportes(res.data.reportes || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const exportarCSV = () => {
    const headers = ['ID', 'Fecha', 'Ruta', 'Conductor', 'Vehículo', 'Toneladas', 'KM', 'Tiempo (min)', 'Eficiencia (%)'];
    const rows = reportes.map(r => [
      r.id,
      new Date(r.fecha).toLocaleDateString(),
      r.ruta_nombre,
      r.conductor_nombre,
      r.vehiculo_placa,
      r.toneladas,
      r.km_recorridos,
      r.tiempo_minutos,
      r.porcentaje_cumplimiento
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_operativo_${filtros.inicio}_${filtros.fin}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    
    // Encabezado
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(0, 255, 157);
    doc.setFontSize(22);
    doc.text('CollTrash', 15, 20);
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text('Reporte Operativo de Recolección', 15, 28);
    doc.text(`Periodo: ${filtros.inicio} a ${filtros.fin}`, 15, 34);
    doc.text(`Generado: ${new Date().toLocaleString()}`, 140, 28);

    // Resumen Ejecutivo
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text('Resumen del Periodo', 15, 55);
    
    autoTable(doc, {
      startY: 60,
      head: [['Métrica', 'Valor']],
      body: [
        ['Toneladas Totales', `${totalTons} t`],
        ['Kilómetros Totales', `${totalKM} km`],
        ['Eficiencia Promedio', `${avgEff}%`]
      ],
      theme: 'striped',
      headStyles: { fillColor: [0, 255, 157], textColor: [0, 0, 0] }
    });

    // Detalle
    doc.text('Detalle de Operaciones', 15, doc.lastAutoTable.finalY + 15);
    
    const tableRows = reportes.map(r => [
      new Date(r.fecha).toLocaleDateString(),
      `${r.ruta_nombre}\n(${r.conductor_nombre})`,
      r.vehiculo_placa,
      `${r.toneladas} t`,
      `${r.km_recorridos} km`,
      `${r.porcentaje_cumplimiento}%`
    ]);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 20,
      head: [['Fecha', 'Ruta / Conductor', 'Placa', 'Toneladas', 'Distancia', 'Eficiencia']],
      body: tableRows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] }
    });

    doc.save(`reporte_operativo_${filtros.inicio}.pdf`);
  };

  const s = {
    card: { background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '20px' },
    th: { padding: '15px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid #333' },
    td: { padding: '15px', fontSize: '14px', borderBottom: '1px solid #222' }
  };

  const totalTons = reportes.reduce((acc, r) => acc + parseFloat(r.toneladas || 0), 0).toFixed(1);
  const totalKM = reportes.reduce((acc, r) => acc + parseFloat(r.km_recorridos || 0), 0).toFixed(1);
  const avgEff = reportes.length ? (reportes.reduce((acc, r) => acc + parseFloat(r.porcentaje_cumplimiento || 0), 0) / reportes.length).toFixed(0) : 0;

  return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'white' }}>Reportes Operativos</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Métricas detalladas de recolección y logística</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={exportarCSV}
            className="btn" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid #333' }}
          >
            <i className="bi bi-file-earmark-spreadsheet"></i> CSV
          </button>
          <button 
            onClick={exportarPDF}
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px' }}
          >
            <i className="bi bi-file-earmark-pdf-fill"></i> Exportar PDF
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div style={s.card}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>FECHA INICIO</label>
            <input 
              type="date" 
              className="card" 
              style={{ width: '100%', padding: '12px', background: 'var(--bg-secondary)', color: 'white', border: '1px solid #333' }}
              value={filtros.inicio}
              onChange={e => setFiltros({...filtros, inicio: e.target.value})}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>FECHA FIN</label>
            <input 
              type="date" 
              className="card" 
              style={{ width: '100%', padding: '12px', background: 'var(--bg-secondary)', color: 'white', border: '1px solid #333' }}
              value={filtros.fin}
              onChange={e => setFiltros({...filtros, fin: e.target.value})}
            />
          </div>
          <button 
            onClick={cargarDatos}
            style={{ padding: '12px 30px', borderRadius: '10px', background: 'var(--color-primary)', color: '#000', border: 'none', fontWeight: 700, cursor: 'pointer' }}
          >
            Filtrar Datos
          </button>
        </div>
      </div>

      {/* RESUMEN RÁPIDO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
        <div style={{ ...s.card, marginBottom: 0, borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>TONELADAS TOTALES</div>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{totalTons} t</div>
        </div>
        <div style={{ ...s.card, marginBottom: 0, borderLeft: '4px solid #00c2ff' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>DISTANCIA TOTAL</div>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{totalKM} km</div>
        </div>
        <div style={{ ...s.card, marginBottom: 0, borderLeft: '4px solid #ffcc00' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>CUMPLIMIENTO PROM.</div>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{avgEff}%</div>
        </div>
      </div>

      {/* TABLA DE DETALLES */}
      <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
            <tr>
              <th style={s.th}>Fecha</th>
              <th style={s.th}>Ruta / Conductor</th>
              <th style={s.th}>Vehículo</th>
              <th style={s.th}>Toneladas</th>
              <th style={s.th}>KM</th>
              <th style={s.th}>Tiempo</th>
              <th style={s.th}>Eficiencia</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center' }}>Cargando reportes detallados...</td></tr>
            ) : reportes.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No hay datos para este rango de fechas</td></tr>
            ) : reportes.map(r => (
              <tr key={r.id}>
                <td style={s.td}>{new Date(r.fecha).toLocaleDateString()}</td>
                <td style={s.td}>
                  <div style={{ fontWeight: 600 }}>{r.ruta_nombre}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.conductor_nombre}</div>
                </td>
                <td style={s.td}><span style={{ padding: '4px 8px', borderRadius: '4px', background: '#1a1a1a', border: '1px solid #333', fontSize: '12px' }}>{r.vehiculo_placa}</span></td>
                <td style={{ ...s.td, color: 'var(--color-primary)', fontWeight: 700 }}>{r.toneladas} t</td>
                <td style={s.td}>{r.km_recorridos} km</td>
                <td style={s.td}>{r.tiempo_minutos} min</td>
                <td style={s.td}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1, height: '4px', background: '#222', borderRadius: '2px', minWidth: '60px' }}>
                        <div style={{ width: `${r.porcentaje_cumplimiento}%`, height: '100%', background: r.porcentaje_cumplimiento > 90 ? 'var(--color-primary)' : 'var(--color-warning)', borderRadius: '2px' }}></div>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>{r.porcentaje_cumplimiento}%</span>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
