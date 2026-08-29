const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  max: 20,
  idleTimeoutMillis: 30000,

  // Tiempo de espera para OBTENER una conexión del pool. Con el valor anterior
  // (2 s) cualquier pico de tráfico hacía fallar peticiones que sólo
  // necesitaban esperar su turno: al agotarse el pool, en vez de encolarse,
  // devolvían error. Es la causa más habitual de "el sistema se cae con varios
  // usuarios" en pruebas de carga (RNF-04: 50 vehículos simultáneos).
  connectionTimeoutMillis: 10000,

  // Cortafuegos ante una consulta degenerada: ninguna sentencia puede retener
  // una conexión indefinidamente y arrastrar al resto del sistema.
  statement_timeout: 15000,
});

pool.on('error', (err) => {
  // Un cliente inactivo puede morir por un corte de red o un reinicio de
  // PostgreSQL. Sin este manejador, el evento 'error' del pool derriba
  // el proceso entero de Node.
  console.error('Error inesperado en cliente inactivo del pool:', err.message);
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
