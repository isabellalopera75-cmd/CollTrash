/**
 * Resolución de tokens de diseño para lienzos (canvas).
 *
 * Chart.js dibuja sobre <canvas>, no sobre el DOM, de modo que no interpreta
 * `var(--token)`: recibirlo como cadena hace que pinte en negro. Estas
 * utilidades leen el valor real del token desde el elemento indicado, para
 * poder pasárselo a la gráfica ya resuelto.
 */

/** Devuelve el valor real de un token, resuelto en el ámbito de `el`. */
export function token(nombre, el) {
  const base = el || document.querySelector('.admin-shell') || document.documentElement;
  const v = getComputedStyle(base).getPropertyValue(nombre).trim();
  return v || '#888888';
}

/** Convierte un color hexadecimal en rgba con la opacidad indicada. */
export function conAlfa(hex, alfa) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6 && h.length !== 3) return hex;
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

/** Paleta ya resuelta para alimentar gráficas. */
export function paletaGraficas(el) {
  return {
    marca:   token('--marca', el),
    alerta:  token('--alerta', el),
    info:    token('--info', el),
    peligro: token('--peligro', el),
    texto2:  token('--texto-2', el),
    texto3:  token('--texto-3', el),
    borde:   token('--borde-fuerte', el),
  };
}
