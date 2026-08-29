/**
 * Presentación de las notificaciones.
 *
 * El icono y el color viven aquí y no en cada pantalla por dos motivos:
 *
 *  1. La campana, los avisos flotantes y la bitácora mostraban tres criterios
 *     distintos para el mismo aviso.
 *  2. El título que llega del servidor ya no trae emoji. Un emoji dentro del
 *     dato no se puede tematizar, no hereda el color del estado y se duplicaba
 *     con el icono que la tabla ya pintaba al lado.
 */

// El icono se elige por el tipo de suceso, que viaja en metadata.tipo.
const ICONOS_POR_SUCESO = {
  INICIO_RUTA:       'bi-play-circle-fill',
  FIN_RUTA:          'bi-flag-fill',
  BLOQUEO_INICIO:    'bi-slash-circle-fill',
  NO_ASISTIDO:       'bi-person-x-fill',
  INICIO_DESCARGA:   'bi-truck',
  FIN_DESCARGA:      'bi-box-seam-fill',
  INCIDENCIA:        'bi-exclamation-triangle-fill',
  RELEVO_EMERGENCIA: 'bi-arrow-left-right',
  REPORTE_CIUDADANO: 'bi-megaphone-fill',
  REPORTE_ASIGNADO:  'bi-signpost-2-fill',
  REPORTE_RESUELTO:  'bi-check2-circle'
};

// Respaldo por categoría, para un suceso que no esté en la tabla de arriba.
const ICONOS_POR_CATEGORIA = {
  urgente:   'bi-exclamation-triangle-fill',
  operativo: 'bi-info-circle-fill',
  comunidad: 'bi-people-fill'
};

/** Clase de icono de Bootstrap Icons para una notificación. */
export function iconoNotificacion(notificacion) {
  const suceso = notificacion?.metadata?.tipo;

  // Un inicio tardío y uno puntual comparten suceso (INICIO_RUTA) pero no
  // significan lo mismo para quien coordina: el reloj lo delata de un vistazo,
  // sin tener que leer el título. Los registros anteriores a que se guardara
  // `inicio_tardio` se reconocen porque nacen con categoría urgente.
  if (suceso === 'INICIO_RUTA') {
    const tardio = notificacion?.metadata?.inicio_tardio || notificacion?.tipo === 'urgente';
    return tardio ? 'bi-clock-history' : 'bi-play-circle-fill';
  }

  return ICONOS_POR_SUCESO[suceso]
    || ICONOS_POR_CATEGORIA[notificacion?.tipo]
    || 'bi-bell-fill';
}

/** Color de la paleta según la categoría de la notificación. */
export function colorNotificacion(tipo) {
  if (tipo === 'urgente') return 'var(--peligro)';
  if (tipo === 'operativo') return 'var(--color-primary)';
  if (tipo === 'comunidad') return 'var(--color-accent)';
  return 'var(--texto-3)';
}

/**
 * Limpia el emoji inicial de los títulos guardados antes de este cambio.
 * Las filas nuevas ya llegan sin él; esto evita que la bitácora mezcle
 * notificaciones con emoji y sin emoji mientras queden registros antiguos.
 */
export function tituloNotificacion(titulo) {
  if (!titulo) return '';
  return titulo.replace(/^[^\p{L}\p{N}]+/u, '').trim() || titulo;
}
