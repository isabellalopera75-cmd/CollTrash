const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Envío de correo del sistema.
 *
 * nodemailer figuraba en las dependencias del proyecto pero no se importaba en
 * ningún sitio: no había ningún correo saliente. Este servicio es el único
 * punto por el que sale correo, para que mañana cambiar de proveedor sea tocar
 * un archivo y no rastrear transportes repartidos por los controladores.
 */

const GMAIL_USER = (process.env.GMAIL_USER || '').trim();
const GMAIL_PASS = (process.env.GMAIL_PASS || '').trim();

/** ¿Hay credenciales de correo cargadas? */
const correoConfigurado = () => Boolean(GMAIL_USER && GMAIL_PASS);

let transporte = null;

const obtenerTransporte = () => {
  if (!correoConfigurado()) return null;
  // Se crea una sola vez: cada createTransport abre su propio grupo de
  // conexiones SMTP, y crearlo por envío deja conexiones colgando.
  if (!transporte) {
    transporte = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS }
    });
  }
  return transporte;
};

/**
 * Envía un correo.
 *
 * Devuelve { enviado, motivo } en lugar de lanzar: quien llama decide qué hacer
 * cuando el correo falla. En la recuperación de contraseña, por ejemplo, no debe
 * revelarse al visitante si el envío salió o no.
 */
const enviarCorreo = async ({ para, asunto, html, texto }) => {
  const tr = obtenerTransporte();
  if (!tr) {
    console.warn('[correo] Sin credenciales (GMAIL_USER / GMAIL_PASS). No se envió:', asunto);
    return { enviado: false, motivo: 'sin_configurar' };
  }

  try {
    const info = await tr.sendMail({
      from: `"CollTrash · Gestión de residuos" <${GMAIL_USER}>`,
      to: para,
      subject: asunto,
      text: texto,
      html
    });
    console.log('[correo] Enviado:', asunto, '→', info.messageId);
    return { enviado: true, id: info.messageId };
  } catch (error) {
    console.error('[correo] Falló el envío:', error.message);
    return { enviado: false, motivo: 'error_envio', detalle: error.message };
  }
};

/**
 * Plantilla del correo de recuperación.
 *
 * Todo el estilo va en línea: los clientes de correo descartan las hojas de
 * estilo externas y buena parte de lo que va en <style>.
 */
const plantillaRecuperacion = ({ nombre, enlace, minutos }) => {
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#171E17">
    <div style="background:#1B5E20;padding:24px 28px;border-radius:8px 8px 0 0">
      <div style="color:#ffffff;font-size:22px;font-weight:bold">CollTrash</div>
      <div style="color:#D6E8D8;font-size:13px;margin-top:4px">Gestión de residuos · Neiva, Huila</div>
    </div>
    <div style="border:1px solid #D6DCD4;border-top:none;padding:28px;border-radius:0 0 8px 8px">
      <p style="font-size:15px;margin:0 0 16px">Hola ${nombre},</p>
      <p style="font-size:15px;line-height:1.55;margin:0 0 24px">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta.
        Pulsa el botón para elegir una nueva.
      </p>
      <p style="margin:0 0 24px">
        <a href="${enlace}" style="display:inline-block;background:#1B5E20;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:6px;font-size:15px;font-weight:bold">
          Restablecer mi contraseña
        </a>
      </p>
      <p style="font-size:13px;color:#4F5A4E;line-height:1.55;margin:0 0 8px">
        El enlace caduca en ${minutos} minutos y sólo puede usarse una vez.
      </p>
      <p style="font-size:13px;color:#4F5A4E;line-height:1.55;margin:0 0 24px">
        Si no fuiste tú quien lo pidió, ignora este mensaje: tu contraseña actual
        sigue siendo válida.
      </p>
      <p style="font-size:12px;color:#6B776A;line-height:1.55;margin:0;border-top:1px solid #E7EBE5;padding-top:16px">
        Si el botón no funciona, copia esta dirección en tu navegador:<br>
        <span style="color:#1B5E20;word-break:break-all">${enlace}</span>
      </p>
    </div>
  </div>`;

  const texto = [
    `Hola ${nombre},`,
    '',
    'Recibimos una solicitud para restablecer la contraseña de tu cuenta de CollTrash.',
    'Abre esta dirección para elegir una nueva:',
    '',
    enlace,
    '',
    `El enlace caduca en ${minutos} minutos y sólo puede usarse una vez.`,
    'Si no fuiste tú quien lo pidió, ignora este mensaje.'
  ].join('\n');

  return { html, texto };
};

module.exports = { enviarCorreo, correoConfigurado, plantillaRecuperacion };
