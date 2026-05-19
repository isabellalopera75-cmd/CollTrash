import axios from 'axios';

const API = axios.create({
  baseURL: window.location.hostname === 'localhost' && window.location.port !== '3000' ? 'http://localhost:3000/api' : '/api'
});

// Agregar token automáticamente a cada petición
API.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Capturar errores 401 (Token expirado o inválido) a nivel global
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      sessionStorage.removeItem('token');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/portal') {
        window.location.href = '/login';
      }
      if (window.location.pathname === '/portal') {
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (data) => API.post('/auth/login', data);
export const registrarCiudadano = (data) => API.post('/auth/registrar-ciudadano', data);
export const registrarConductor = (data) => API.post('/auth/registrar-conductor', data);
export const editarConductor = (id, data) => API.put(`/auth/conductor/${id}`, data);
export const obtenerPerfil = () => API.get('/auth/perfil');
export const verificarCorreo = (email) => API.get(`/auth/verificar-correo?email=${email}`);

// Rutas
export const obtenerRutas = () => API.get('/rutas');
export const obtenerRutaPorId = (id) => API.get(`/rutas/${id}`);
export const crearRuta = (data) => API.post('/rutas', data);
export const editarRuta = (id, data) => API.put(`/rutas/${id}`, data);
export const eliminarRuta = (id) => API.delete(`/rutas/${id}`);
export const restaurarRuta = (id) => API.put(`/rutas/${id}/restaurar`);

// Puntos de Descarga
export const obtenerPuntosDescarga = () => API.get('/puntos-descarga');
export const crearPuntoDescarga = (data) => API.post('/puntos-descarga', data);
export const eliminarPuntoDescarga = (id) => API.delete(`/puntos-descarga/${id}`);
export const obtenerVehiculos = () => API.get('/rutas/vehiculos');
export const crearVehiculo = (data) => API.post('/rutas/vehiculos', data);
export const editarVehiculo = (id, data) => API.put(`/rutas/vehiculos/${id}`, data);
export const obtenerJornadas = () => API.get('/rutas/jornadas');
export const crearJornada = (data) => API.post('/rutas/jornadas', data);
export const editarJornada = (id, data) => API.put(`/rutas/jornadas/${id}`, data);
export const obtenerConductores = () => API.get('/auth/conductores');
export const obtenerAsignaciones = (fecha) => API.get(`/asignaciones?fecha=${fecha}`);
export const reasignarAsignacion = (id, data) => API.put(`/asignaciones/${id}/reasignar`, data);

// Reportes ciudadanos
export const obtenerReportes = () => API.get('/reportes');
export const obtenerMisReportes = () => API.get('/reportes/mis-reportes');
export const actualizarEstadoReporte = (id, data) => API.put(`/reportes/${id}/estado`, data);
export const atenderReporte = (id, data) => API.put(`/reportes/${id}/atender`, data);
export const rechazarReporte = (id, data) => API.put(`/reportes/${id}/rechazar`, data);
export const crearReporteCiudadano = (data) => API.post('/reportes', data);

// Barrios
export const obtenerBarrios = () => API.get('/barrios');
export const detectarBarrio = (lat, lng) => API.get(`/barrios/detectar?lat=${lat}&lng=${lng}`);

// Dashboard
export const dashboardDiario = () => API.get('/dashboard/diario');
export const dashboardSemanal = () => API.get('/dashboard/semanal');
export const dashboardMensual = () => API.get('/dashboard/mensual');
export const obtenerReporteEficiencia = (inicio, fin) => API.get(`/dashboard/eficiencia?inicio=${inicio}&fin=${fin}`);
export const obtenerNovedadesOperativas = () => API.get('/dashboard/novedades');

// Notificaciones
export const obtenerNotificaciones = () => API.get('/notificaciones');
export const marcarNotificacionLeida = (id) => API.put(`/notificaciones/${id}/leer`);
export const marcarTodasLeidas = () => API.put('/notificaciones/leer-todo');

// Configuración
export const obtenerConfig = () => API.get('/config');
export const actualizarConfig = (data) => API.post('/config', data);
export const obtenerHistorial = () => API.get('/auditoria');

export default API;