import { useState, useEffect } from 'react';
import AdminLayout from '../components/Layout/AdminLayout';
import { obtenerReporteEficiencia } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getFechaColombia, formatearDiaLargo } from '../utils/dateUtils';

export default function ReportesOperativos() {
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    inicio: getFechaColombia(-7),
    fin: getFechaColombia()
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

  // Punto y coma como separador, no coma.
  //
  // Excel usa como separador de listas el que marca la configuración regional
  // del sistema, y en español es el punto y coma. Con comas, el archivo se
  // abría entero dentro de la columna A. El punto y coma además libera a la
  // coma para su papel de separador decimal.
  const SEPARADOR_CSV = ';';

  /**
   * Escapa un valor para CSV.
   *
   * Sin esto, un nombre de ruta que contenga el separador partiria la fila y
   * descuadraria todas las columnas a partir de ahi. La regla del formato es
   * entrecomillar el campo y duplicar las comillas internas.
   */
  const campoCSV = (valor) => {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    // Se entrecomilla sólo si el valor contiene el separador en uso, comillas o
    // un salto de línea. Comprobar la coma sin más entrecomillaba todas las
    // cifras decimales —«1,50»— y llenaba la hoja de ruido innecesario.
    const necesitaComillas = texto.includes(SEPARADOR_CSV) || /["\n\r]/.test(texto);
    return necesitaComillas ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  };

  /**
   * Formatea una cifra para la hoja de cálculo: redondeada y con coma decimal.
   *
   * Los minutos llegaban del servidor como 5.4060882833333333 y se escribían
   * tal cual, con dieciséis decimales. Y con el punto como separador decimal,
   * Excel en español no reconoce el valor como número y lo trata como texto.
   */
  const numeroCSV = (valor, decimales = 2) => {
    const n = Number(valor);
    return Number.isFinite(n) ? n.toFixed(decimales).replace('.', ',') : '';
  };

  const exportarCSV = () => {
    const headers = ['ID', 'Fecha', 'Ruta', 'Conductor', 'Vehículo', 'Toneladas', 'KM', 'Tiempo (min)', 'Cumplimiento (%)'];
    const rows = reportes.map(r => [
      r.id,
      formatearDiaLargo(r.fecha),
      r.ruta_nombre,
      r.conductor_nombre,
      r.vehiculo_placa,
      numeroCSV(r.toneladas),
      numeroCSV(r.km_recorridos),
      numeroCSV(r.tiempo_minutos, 1),
      numeroCSV(r.porcentaje_cumplimiento)
    ]);

    // El BOM inicial es para Excel: sin el abre el archivo con la codificacion
    // del sistema y los acentos salen como «JardÃ­n».
    const csv = '\uFEFF'
      + [headers, ...rows].map(fila => fila.map(campoCSV).join(SEPARADOR_CSV)).join('\r\n');

    // Blob y no data:URI: encodeURI deja pasar el simbolo # y trunca el
    // archivo, y el URI tiene un limite de longitud que un rango amplio supera.
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte_operativo_${filtros.inicio}_${filtros.fin}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Paleta del documento impreso, tomada del sistema de diseño. El verde es el
  // corporativo (RI-UI.1); el informe anterior usaba un verde neón que no
  // pertenece a la identidad y que sobre papel blanco pierde legibilidad.
  const VERDE = [27, 94, 32];
  const VERDE_SUAVE = [237, 245, 238];
  const TINTA = [23, 30, 23];
  const GRIS = [110, 120, 110];
  const LINEA = [214, 220, 212];

  const exportarPDF = () => {
    const doc = new jsPDF();
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    const margen = 15;

    // ── Encabezado ────────────────────────────────────────────────────────
    doc.setFillColor(...VERDE);
    doc.rect(0, 0, ancho, 32, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text('CollTrash', margen, 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(214, 232, 216);
    doc.text('Reporte operativo de recolección · Neiva, Huila', margen, 22);
    doc.text(
      `Periodo: ${formatearDiaLargo(filtros.inicio)} — ${formatearDiaLargo(filtros.fin)}`,
      margen, 28
    );
    doc.text(
      `Generado el ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' })}`,
      ancho - margen, 28, { align: 'right' }
    );

    // ── Indicadores del periodo ───────────────────────────────────────────
    // Tres cifras en tarjetas en lugar de una tabla de dos columnas: son el
    // resumen que se lee de un vistazo, no un listado que se recorre.
    const indicadores = [
      ['Toneladas recolectadas', `${totalTons} t`],
      ['Distancia recorrida', `${totalKM} km`],
      ['Cumplimiento promedio', `${avgEff}%`]
    ];
    const separacion = 5;
    const anchoTarjeta = (ancho - margen * 2 - separacion * 2) / 3;

    indicadores.forEach(([etiqueta, valor], i) => {
      const x = margen + i * (anchoTarjeta + separacion);
      doc.setFillColor(...VERDE_SUAVE);
      doc.roundedRect(x, 42, anchoTarjeta, 21, 2, 2, 'F');

      doc.setTextColor(...GRIS);
      doc.setFontSize(7);
      doc.text(etiqueta.toUpperCase(), x + 5, 50);

      doc.setTextColor(...TINTA);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(valor, x + 5, 59);
      doc.setFont('helvetica', 'normal');
    });

    // ── Detalle ───────────────────────────────────────────────────────────
    doc.setTextColor(...TINTA);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Detalle de operaciones', margen, 76);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRIS);
    doc.text(
      `${reportes.length} ${reportes.length === 1 ? 'jornada completada' : 'jornadas completadas'} en el periodo`,
      margen, 81
    );

    autoTable(doc, {
      startY: 86,
      head: [['Fecha', 'Ruta y conductor', 'Placa', 'Toneladas', 'Distancia', 'Cumpl.']],
      body: reportes.map(r => [
        formatearDiaLargo(r.fecha, { conAnio: false }),
        `${r.ruta_nombre}\n${r.conductor_nombre}`,
        r.vehiculo_placa,
        `${r.toneladas} t`,
        `${r.km_recorridos} km`,
        `${r.porcentaje_cumplimiento}%`
      ]),
      foot: reportes.length > 1
        ? [['', 'Total del periodo', '', `${totalTons} t`, `${totalKM} km`, `${avgEff}%`]]
        : undefined,
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 3, textColor: TINTA, lineColor: LINEA },
      headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      footStyles: { fillColor: VERDE_SUAVE, textColor: TINTA, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 247] },
      // Las cifras se alinean a la derecha: así las unidades quedan en columna
      // y se comparan de un vistazo, que es para lo que existe una tabla.
      columnStyles: {
        0: { cellWidth: 34 },
        2: { cellWidth: 22 },
        3: { halign: 'right', cellWidth: 24 },
        4: { halign: 'right', cellWidth: 24 },
        5: { halign: 'right', cellWidth: 20 }
      },
      margin: { left: margen, right: margen, bottom: 22 }
    });

    if (reportes.length === 0) {
      doc.setTextColor(...GRIS);
      doc.setFontSize(10);
      doc.text('No hay jornadas completadas en el periodo seleccionado.', margen, doc.lastAutoTable.finalY + 12);
    }

    // ── Pie de página, en todas las hojas ─────────────────────────────────
    // Se dibuja al final porque hasta aquí no se sabe cuántas páginas hay.
    const paginas = doc.internal.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
      doc.setPage(p);
      doc.setDrawColor(...LINEA);
      doc.line(margen, alto - 14, ancho - margen, alto - 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...GRIS);
      doc.text('CollTrash · Sistema de gestión de residuos sólidos', margen, alto - 9);
      doc.text(`Página ${p} de ${paginas}`, ancho - margen, alto - 9, { align: 'right' });
    }

    doc.save(`reporte_operativo_${filtros.inicio}_${filtros.fin}.pdf`);
  };

  const s = {
    card: { background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '20px' },
    th: { padding: '15px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--borde)' },
    td: { padding: '15px', fontSize: '14px', borderBottom: '1px solid var(--superficie-2)' }
  };

  const totalTons = reportes.reduce((acc, r) => acc + parseFloat(r.toneladas || 0), 0).toFixed(1);
  const totalKM = reportes.reduce((acc, r) => acc + parseFloat(r.km_recorridos || 0), 0).toFixed(1);
  const avgEff = reportes.length ? (reportes.reduce((acc, r) => acc + parseFloat(r.porcentaje_cumplimiento || 0), 0) / reportes.length).toFixed(0) : 0;

  return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--texto)' }}>Reportes Operativos</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Métricas detalladas de recolección y logística</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={exportarCSV}
            className="btn" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', background: 'var(--borde)', color: 'var(--texto)', border: '1px solid var(--borde)' }}
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
      <div className="card" style={{ padding: '20px', borderRadius: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>FECHA INICIO</label>
            <input 
              type="date" 
              className="card" 
              style={{ width: '100%', padding: '12px', background: 'var(--bg-secondary)', color: 'var(--texto)', border: '1px solid var(--borde)' }}
              value={filtros.inicio}
              onChange={e => setFiltros({...filtros, inicio: e.target.value})}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>FECHA FIN</label>
            <input 
              type="date" 
              className="card" 
              style={{ width: '100%', padding: '12px', background: 'var(--bg-secondary)', color: 'var(--texto)', border: '1px solid var(--borde)' }}
              value={filtros.fin}
              onChange={e => setFiltros({...filtros, fin: e.target.value})}
            />
          </div>
          <button 
            onClick={cargarDatos}
            style={{ padding: '12px 30px', borderRadius: '10px', background: 'var(--color-primary)', color: 'var(--marca-contraste)', border: 'none', fontWeight: 700, cursor: 'pointer' }}
          >
            Filtrar Datos
          </button>
        </div>
      </div>

      {/* RESUMEN RÁPIDO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
        <div className="card" style={{ padding: '20px', borderRadius: '16px', borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>TONELADAS TOTALES</div>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{totalTons} t</div>
        </div>
        <div className="card" style={{ padding: '20px', borderRadius: '16px', borderLeft: '4px solid var(--info)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>DISTANCIA TOTAL</div>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{totalKM} km</div>
        </div>
        <div className="card" style={{ padding: '20px', borderRadius: '16px', borderLeft: '4px solid var(--alerta)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>CUMPLIMIENTO PROM.</div>
          <div style={{ fontSize: '28px', fontWeight: 800 }}>{avgEff}%</div>
        </div>
      </div>

      {/* TABLA DE DETALLES */}
      <div className="card" style={{ padding: 0, borderRadius: '16px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--superficie-2)' }}>
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
                <td style={s.td}>{formatearDiaLargo(r.fecha, { conAnio: false })}</td>
                <td style={s.td}>
                  <div style={{ fontWeight: 600 }}>{r.ruta_nombre}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.conductor_nombre}</div>
                </td>
                <td style={s.td}><span style={{ padding: '4px 8px', borderRadius: '4px', background: 'var(--superficie)', border: '1px solid var(--borde)', fontSize: '12px' }}>{r.vehiculo_placa}</span></td>
                <td style={{ ...s.td, color: 'var(--color-primary)', fontWeight: 700 }}>{r.toneladas} t</td>
                <td style={s.td}>{r.km_recorridos} km</td>
                <td style={s.td}>{r.tiempo_minutos} min</td>
                <td style={s.td}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1, height: '4px', background: 'var(--superficie-2)', borderRadius: '2px', minWidth: '60px' }}>
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
