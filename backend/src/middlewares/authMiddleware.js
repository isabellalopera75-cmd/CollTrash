const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Verifica el JWT y expone { id, email, rol, nombre } en req.usuario.
 *
 * Sólo la ausencia o invalidez del token produce 401: el frontend destruye la
 * sesión ante un 401 (RF-01.5 / RNF-05). Los fallos de autorización sobre un
 * recurso concreto deben responder 403 para no cerrar la sesión del usuario.
 */
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ mensaje: 'Acceso denegado. Token no proporcionado.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ mensaje: 'Token inválido o expirado.' });
  }
};

/**
 * Restringe el acceso a los roles indicados (RNF-04).
 * Responde 403: el usuario está autenticado, sólo no le corresponde el recurso.
 */
const exigirRol = (...roles) => (req, res, next) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) {
    return res.status(403).json({ mensaje: 'Acceso denegado. No tiene permisos para esta operación.' });
  }
  next();
};

const soloAdmin = exigirRol('administrador');
const soloConductor = exigirRol('conductor');
const soloCiudadano = exigirRol('ciudadano');

module.exports = { verificarToken, exigirRol, soloAdmin, soloConductor, soloCiudadano };
