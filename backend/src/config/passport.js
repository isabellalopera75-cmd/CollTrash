const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./database');
require('dotenv').config();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback'
},
async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value;
    const nombre = profile.displayName;
    const google_id = profile.id;
    const foto_perfil = profile.photos[0]?.value;

    // Verificar si el ciudadano ya existe
    const existe = await pool.query(
      'SELECT * FROM ciudadanos WHERE google_id = $1',
      [google_id]
    );

    if (existe.rows.length > 0) {
      return done(null, existe.rows[0]);
    }

    // Crear nuevo ciudadano
    const nuevo = await pool.query(
      `INSERT INTO ciudadanos (nombre, email, google_id, foto_perfil)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, email, google_id, foto_perfil]
    );

    return done(null, nuevo.rows[0]);

  } catch (error) {
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;