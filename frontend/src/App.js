import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/Auth/PrivateRoute';
import Login from './components/Auth/Login';
import Dashboard from './pages/Dashboard';
import Rutas from './pages/Rutas';
import ConfigurarRutas from './pages/ConfigurarRutas';
import PuntosDescarga from './pages/PuntosDescarga';
import Conductores from './pages/Conductores';
import Vehiculos from './pages/Vehiculos';
import Monitoreo from './pages/Monitoreo';
import Reportes from './pages/Reportes';
import Configuracion from './pages/Configuracion';
import Historial from './pages/Historial';
import PortalCiudadano from './pages/PortalCiudadano';
import ConductorPanel from './pages/ConductorPanel';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<PrivateRoute rol="administrador"><Dashboard /></PrivateRoute>} />
          <Route path="/rutas" element={<PrivateRoute rol="administrador"><Rutas /></PrivateRoute>} />
          <Route path="/configurar-rutas" element={<PrivateRoute rol="administrador"><ConfigurarRutas /></PrivateRoute>} />
          <Route path="/puntos-descarga" element={<PrivateRoute rol="administrador"><PuntosDescarga /></PrivateRoute>} />
          <Route path="/conductores" element={<PrivateRoute rol="administrador"><Conductores /></PrivateRoute>} />
          <Route path="/vehiculos" element={<PrivateRoute rol="administrador"><Vehiculos /></PrivateRoute>} />
          <Route path="/monitoreo" element={<PrivateRoute rol="administrador"><Monitoreo /></PrivateRoute>} />
          <Route path="/reportes" element={<PrivateRoute rol="administrador"><Reportes /></PrivateRoute>} />
          <Route path="/configuracion" element={<PrivateRoute rol="administrador"><Configuracion /></PrivateRoute>} />
          <Route path="/historial" element={<PrivateRoute rol="administrador"><Historial /></PrivateRoute>} />
          <Route path="/portal" element={<PortalCiudadano />} />
          <Route path="/conductor" element={<PrivateRoute rol="conductor"><ConductorPanel /></PrivateRoute>} />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}