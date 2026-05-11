const pool = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function cambiarPasswordAdmin() {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash('123456', salt);
    
    const res = await pool.query(
      "UPDATE usuarios SET password_hash = $1 WHERE email = 'admin@colltrash.com' RETURNING id",
      [hashed]
    );
    
    if (res.rows.length > 0) {
      console.log('✅ Contraseña de Admin actualizada con éxito a: 123456');
    } else {
      console.log('❌ No se encontró el usuario admin@colltrash.com');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    process.exit();
  }
}

cambiarPasswordAdmin();
