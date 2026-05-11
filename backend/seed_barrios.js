const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'colltrash',
  password: 'Lai+0807', // Ajustado según .env
  port: 5432,
});

const barrios = [
  { nombre: 'Canaima', sector: 'Sur', lat: 2.9036, lng: -75.2863 },
  { nombre: 'Las Palmas', sector: 'Oriente', lat: 2.9315, lng: -75.2587 },
  { nombre: 'El Jardín', sector: 'Norte', lat: 2.9512, lng: -75.2821 },
  { nombre: 'Cándido Leguízamo', sector: 'Norte', lat: 2.9458, lng: -75.2934 },
  { nombre: 'Buganviles', sector: 'Oriente', lat: 2.9284, lng: -75.2692 },
  { nombre: 'Ipanema', sector: 'Oriente', lat: 2.9251, lng: -75.2543 },
  { nombre: 'Los Alpes', sector: 'Sur', lat: 2.9123, lng: -75.2789 }
];

async function seed() {
  try {
    for (const b of barrios) {
      await pool.query(
        'INSERT INTO barrios (nombre, sector, latitud_centro, longitud_centro) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [b.nombre, b.sector, b.lat, b.lng]
      );
    }
    console.log('✅ Barrios insertados correctamente');
  } catch (e) {
    console.error('❌ Error al insertar barrios:', e);
  } finally {
    await pool.end();
  }
}

seed();
