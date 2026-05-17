const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // Aumentado para soportar más tráfico de monitoreo
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err.message);
  } else {
    console.log('✅ Conectado a PostgreSQL - CollTrash');
    release();
  }
});

module.exports = pool;