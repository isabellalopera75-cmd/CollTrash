const ZONA = 'America/Bogota';

/** Fecha de hoy en Colombia como 'YYYY-MM-DD'. */
function getFechaColombia(offsetDays = 0) {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }
  return d.toLocaleDateString('en-CA', { timeZone: ZONA });
}

/**
 * Minutos transcurridos desde la medianoche en Colombia.
 *
 * Los cálculos de tardanza usaban `new Date()` con la hora del servidor. En
 * local coincide con Colombia, pero en un servidor en UTC toda la lógica de
 * jornadas se desplaza cinco horas y el sistema declara rutas expiradas que
 * apenas comienzan. Este helper fija la referencia a America/Bogota.
 */
function getMinutosDelDiaColombia() {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
  const [hh, mm] = partes.split(':').map(Number);
  return hh * 60 + mm;
}

/** Convierte 'HH:MM' o 'HH:MM:SS' (tipo `time` de PostgreSQL) a minutos. */
function horaAMinutos(hora) {
  if (!hora) return null;
  const [hh, mm] = String(hora).split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

/**
 * Normaliza a 'YYYY-MM-DD' un valor `date` de PostgreSQL o una cadena.
 *
 * Un `date` de PostgreSQL no lleva hora ni zona: node-postgres lo entrega como
 * un Date situado en la medianoche de la zona del proceso. Convertirlo despues
 * a America/Bogota le resta horas y lo pasa al dia anterior en cuanto el
 * servidor no esta en Colombia; con eso, el conductor que intentaba iniciar su
 * ruta recibia "esta ruta corresponde a otra fecha". Aqui se leen los
 * componentes tal como vienen, sin conversion de zona.
 */
function aFechaISO(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    const anio = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    const dia = String(valor.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }
  return String(valor).slice(0, 10);
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Fecha en español y sin hora: 'jueves 27 de agosto de 2026'.
 *
 * Se usa para los textos que lee una persona. Interpolar un Date dentro de una
 * plantilla lo convierte con toString() y produce
 * 'Thu Aug 27 2026 00:00:00 GMT-0500 (hora estándar de Colombia)', que es lo
 * que acababa guardado en el detalle de agenda del reporte y llegaba tal cual
 * al ciudadano.
 *
 * Se construye a partir de la fecha ya normalizada a 'YYYY-MM-DD' y el día de
 * la semana se toma en UTC sobre esos mismos componentes, de modo que ninguna
 * conversión de zona horaria pueda correr el día.
 */
function formatearFechaLarga(valor) {
  const iso = aFechaISO(valor);
  if (!iso) return '';

  const [anio, mes, dia] = iso.split('-').map(Number);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) return '';

  const diaSemana = DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()];
  return `${diaSemana} ${dia} de ${MESES[mes - 1]} de ${anio}`;
}

module.exports = {
  getFechaColombia, getMinutosDelDiaColombia, horaAMinutos, aFechaISO, formatearFechaLarga, ZONA
};
