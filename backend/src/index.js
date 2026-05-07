const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const passport = require('./config/passport');
const { iniciarSocket } = require('./config/socket');
require('dotenv').config();

const { verificarToken, soloAdmin } = require('./middlewares/authMiddleware');
const { generarAsignacionesSemanales } = require('./services/cronService');

const authRoutes = require('./routes/authRoutes');
const rutasRoutes = require('./routes/rutasRoutes');
const conductorRoutes = require('./routes/conductorRoutes');
const reportesRoutes = require('./routes/reportesRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
const server = http.createServer(app);
iniciarSocket(server);

app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

app.use('/api/auth', authRoutes);
app.use('/api/rutas', rutasRoutes);
app.use('/api/conductor', conductorRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.post('/api/test/generar-asignaciones', verificarToken, soloAdmin, async (req, res) => {
  await generarAsignacionesSemanales();
  res.json({ mensaje: 'Asignaciones generadas manualmente.' });
});

app.get('/', (req, res) => {
  res.json({ mensaje: '✅ CollTrash API funcionando correctamente' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});

module.exports = app;