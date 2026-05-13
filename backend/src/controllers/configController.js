const pool = require('../config/database');

const getConfig = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM configuracion');
    const config = {};
    result.rows.forEach(row => { config[row.clave] = row.valor; });
    res.json({ config });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener configuración' });
  }
};

const updateConfig = async (req, res) => {
  const { clave, valor } = req.body;
  try {
    await pool.query(
      'INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = $2',
      [clave, typeof valor === 'object' ? JSON.stringify(valor) : valor]
    );

    // Auditoría
    const { registrarActividad } = require('../services/auditoriaService');
    await registrarActividad(
      req.usuario?.id, 
      'Actualización de Configuración', 
      'configuracion', 
      null, 
      `Se actualizó la clave: ${clave}`
    );

    res.json({ mensaje: 'Configuración actualizada' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar configuración' });
  }
};

module.exports = { getConfig, updateConfig };
