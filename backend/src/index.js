const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { verificarToken, soloAdmin } = require('./middlewares/authMiddleware');
const { iniciarSocket } = require('./config/socket');
require('dotenv').config();

const { generarAsignaciones } = require('./services/cronService');
const { resumeActiveSimulations } = require('./services/simuladorService');

const authRoutes = require('./routes/authRoutes');
const rutasRoutes = require('./routes/rutasRoutes');
const conductorRoutes = require('./routes/conductorRoutes');
const reportesRoutes = require('./routes/reportesRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const barriosRoutes = require('./routes/barriosRoutes');
const asignacionesRoutes = require('./routes/asignacionesRoutes');
const puntosDescargaRoutes = require('./routes/puntosDescargaRoutes');
const incidenciasRoutes = require('./routes/incidenciasRoutes');
const configRoutes = require('./routes/configRoutes');
const auditoriaRoutes = require('./routes/auditoriaRoutes');
const notificacionRoutes = require('./routes/notificacionRoutes');

const app = express();
const server = http.createServer(app);
iniciarSocket(server);

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (ej. postman) o cualquier origin para desarrollo/ngrok
    callback(null, true);
  },
  credentials: true
}));
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan('dev'));
const rateLimit = require('express-rate-limit');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 1500, // Subido a 1500 peticiones por minuto para soportar 20 usuarios desde ngrok (misma IP)
  message: { mensaje: 'Demasiadas peticiones desde esta IP, por favor intente más tarde.' }
});

app.use('/api/', globalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/rutas', rutasRoutes);
app.use('/api/conductor', conductorRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/barrios', barriosRoutes);
app.use('/api/asignaciones', asignacionesRoutes);
app.use('/api/puntos-descarga', puntosDescargaRoutes);
app.use('/api/incidencias', incidenciasRoutes);
app.use('/api/config', configRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/notificaciones', notificacionRoutes);

// Endpoint temporal para probar la generación de la semana (Solo para Admin)
app.post('/api/test/generar-asignaciones', verificarToken, soloAdmin, async (req, res) => {
  try {
    await generarAsignaciones();
    res.json({ mensaje: 'Asignaciones de la próxima semana generadas correctamente' });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error al generar' });
  }
});

// Servir imágenes subidas por ciudadanos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Servir archivos estáticos del frontend de React
app.use(express.static(path.join(__dirname, '../../frontend/build')));

// Redirigir cualquier otra solicitud que no sea API a la aplicación de React
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ mensaje: 'Ruta de API no encontrada.' });
  }
  res.sendFile(path.join(__dirname, '../../frontend/build/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  resumeActiveSimulations(); // Reanudar simulaciones si el servidor se reinició
});

module.exports = app;