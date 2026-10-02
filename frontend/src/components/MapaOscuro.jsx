import { TileLayer, LayersControl, LayerGroup } from 'react-leaflet';

/**
 * Fondo de mapa base, común a todas las pantallas.
 *
 * Incluye el mapa oscuro original (Esri) y una opción satelital para ver las calles.
 * El control de capas permite alternar entre ambas vistas.
 */
export default function MapaOscuro() {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer name="Modo Oscuro">
        <LayerGroup>
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
        </LayerGroup>
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer checked name="Satélite">
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='Tiles &copy; Esri'
          maxNativeZoom={18}
          maxZoom={19}
        />
      </LayersControl.BaseLayer>
    </LayersControl>
  );
}
