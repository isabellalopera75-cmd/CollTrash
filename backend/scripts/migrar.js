/**
 * Ejecutor de migraciones.
 *
 * Aplica en orden los archivos .sql de src/migrations que aún no se hayan
 * aplicado, y deja constancia de cada uno en la tabla `migraciones_aplicadas`.
 *
 * POR QUÉ HACE FALTA
 *
 * Las diecisiete migraciones del proyecto se venían aplicando a mano, una a
 * una, con psql. Eso funciona mientras hay una sola base y alguien recuerda el
 * orden; en un servidor nuevo es una fuente segura de errores: basta saltarse
 * una para que el login o la recuperación de contraseña fallen sin motivo
 * aparente.
 *
 * USO
 *   node scripts/migrar.js            aplica las pendientes
 *   node scripts/migrar.js --estado   sólo informa, no toca nada
 *
 * Cada archivo se aplica dentro de una transacción: si falla a la mitad, no
 * queda a medio aplicar. Los que ya traen su propio BEGIN/COMMIT funcionan
 * igual, porque PostgreSQL admite transacciones anidadas por savepoint.
 */

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

const CARPETA = path.join(__dirname, '..', 'src', 'migrations');

const crearTablaDeControl = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.migraciones_aplicadas (
      archivo     VARCHAR(200) PRIMARY KEY,
      aplicada_en TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    COMMENT ON TABLE public.migraciones_aplicadas IS
      'Migraciones ya ejecutadas. La gestiona scripts/migrar.js; no editar a mano.'
  `);
};

const listarArchivos = () =>
  fs.readdirSync(CARPETA)
    .filter(f => f.endsWith('.sql'))
    // Orden alfabético, que con el prefijo numérico (001_, 002_…) es el
    // cronológico. Si algún día se pasa de 999 habrá que revisar esto.
    .sort();

const main = async () => {
  const soloEstado = process.argv.includes('--estado');
  const client = await pool.connect();

  try {
    await crearTablaDeControl(client);

    const { rows } = await client.query('SELECT archivo FROM migraciones_aplicadas');
    const yaAplicadas = new Set(rows.map(r => r.archivo));

    const archivos = listarArchivos();
    const pendientes = archivos.filter(f => !yaAplicadas.has(f));

    console.log(`Migraciones en disco : ${archivos.length}`);
    console.log(`Ya aplicadas         : ${yaAplicadas.size}`);
    console.log(`Pendientes           : ${pendientes.length}`);

    if (pendientes.length === 0) {
      console.log('\nLa base de datos está al día.');
      return;
    }

    console.log('\nPendientes:');
    pendientes.forEach(f => console.log('  ·', f));

    if (soloEstado) {
      console.log('\n(--estado: no se aplicó ninguna)');
      return;
    }

    for (const archivo of pendientes) {
      const sql = fs.readFileSync(path.join(CARPETA, archivo), 'utf8');
      process.stdout.write(`\nAplicando ${archivo} … `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO migraciones_aplicadas (archivo) VALUES ($1) ON CONFLICT DO NOTHING',
          [archivo]
        );
        await client.query('COMMIT');
        console.log('correcta');
      } catch (error) {
        await client.query('ROLLBACK');
        console.log('FALLÓ');
        console.error(`\n  ${error.message}`);
        console.error('\n  No se aplicó ninguna migración posterior. Corrija y vuelva a ejecutar.');
        process.exitCode = 1;
        return;
      }
    }

    console.log('\nTodas las migraciones pendientes se aplicaron correctamente.');
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch(err => {
  console.error('Error inesperado:', err.message);
  process.exitCode = 1;
});
