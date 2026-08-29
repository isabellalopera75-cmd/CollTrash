export function getFechaColombia(offsetDays = 0) {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Extrae 'YYYY-MM-DD' de una columna `date` de PostgreSQL.
 *
 * El servidor la entrega como '2026-08-27T05:00:00.000Z': el día ya está en los
 * diez primeros caracteres. Pasarla por `new Date(...)` y formatearla en la
 * hora local sería dar un rodeo capaz de correr el día en un huso distinto.
 */
const diaDe = (valor) => {
  if (!valor) return null;
  const texto = typeof valor === 'string' ? valor : new Date(valor).toISOString();
  const partes = texto.slice(0, 10).split('-').map(Number);
  if (partes.length !== 3 || partes.some(n => !Number.isFinite(n))) return null;
  return partes;
};

/**
 * Día de una asignación en español: 'jueves 27 de agosto de 2026'.
 * Con `conAnio: false` se queda en 'jueves 27 de agosto'.
 */
export function formatearDiaLargo(valor, { conAnio = true } = {}) {
  const partes = diaDe(valor);
  if (!partes) return '';
  const [anio, mes, dia] = partes;
  const diaSemana = DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()];
  const base = `${diaSemana} ${dia} de ${MESES[mes - 1]}`;
  return conAnio ? `${base} de ${anio}` : base;
}

/** Día de una asignación abreviado: '27 ago'. */
export function formatearDiaCorto(valor) {
  const partes = diaDe(valor);
  if (!partes) return '';
  const [, mes, dia] = partes;
  return `${dia} ${MESES_CORTOS[mes - 1]}`;
}

/**
 * Fecha de un instante (columnas `timestamp` como created_at) en hora de
 * Colombia: '27 ago'. A diferencia de las anteriores, aquí sí hay que convertir
 * de huso, porque el valor representa un momento y no un día del calendario.
 */
export function formatearInstanteCorto(valor) {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: 'short'
  }).replace('.', '');
}
