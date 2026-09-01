import { TileLayer } from 'react-leaflet';

/**
 * Fondo de mapa oscuro, común a todas las pantallas.
 *
 * POR QUÉ SE CAMBIÓ DE PROVEEDOR
 *
 * Antes se usaba CartoDB (`basemaps.cartocdn.com/dark_all`). CARTO pasó a exigir
 * una clave de API: no bloquea las peticiones —siguen devolviendo 200— sino que
 * estampa la marca de agua «API KEY REQUIRED» sobre cada imagen. El resultado
 * era un mapa legible pero cubierto de texto, en las seis pantallas que llevan
 * mapa.
 *
 * Esri sirve su lienzo oscuro sin clave y está diseñado justamente para esto:
 * un fondo apagado sobre el que destacan los datos que se pintan encima. La
 * alternativa era invertir OpenStreetMap con un filtro CSS, que deja las
 * carreteras casi negras sobre fondo oscuro y los parques de color violeta.
 *
 * SON DOS CAPAS
 *
 * Esri separa el terreno de las etiquetas. La primera trae calles y manzanas;
 * la segunda, que es un PNG con transparencia, los nombres. Sin la segunda el
 * mapa se ve bien pero nadie puede situarse, y para un panel de monitoreo saber
 * en qué calle está el camión es media función.
 *
 * maxNativeZoom: el servicio llega hasta el nivel 16. Sin este límite, al
 * acercarse más Leaflet pediría teselas que no existen y el mapa se quedaría en
 * gris; con él, amplía la última que sí tiene.
 */
export default function MapaOscuro() {
  return (
    <>
      <TileLayer
        url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution='Teselas &copy; Esri'
        maxNativeZoom={16}
        maxZoom={19}
      />
      <TileLayer
        url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        maxNativeZoom={16}
        maxZoom={19}
      />
    </>
  );
}
