/* ==========================================================================
   correo.js — ENVÍO DE CORREOS (recuperación de contraseña, invitaciones)
   Cliente SMTP mínimo sobre TLS (puerto 465), sin librerías.
   Si SMTP no está configurado (desarrollo), el enlace se muestra en la consola
   del servidor en lugar de enviarse.
   ========================================================================== */
'use strict';
const tls = require('node:tls');
const config = require('../config');

function enviarSMTP({ para, asunto, texto }) {
  const { host, puerto, usuario, clave, remitente } = config.smtp;
  const desde = (remitente.match(/<([^>]+)>/) || [, remitente])[1];
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
  const mensaje = [
    'From: ' + remitente, 'To: ' + para, 'Subject: =?UTF-8?B?' + b64(asunto) + '?=',
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64',
    'Date: ' + new Date().toUTCString(), '', b64(texto).replace(/.{76}/g, '$&\r\n')
  ].join('\r\n');
  const pasos = ['EHLO alki', 'AUTH LOGIN', b64(usuario), b64(clave), 'MAIL FROM:<' + desde + '>', 'RCPT TO:<' + para + '>', 'DATA', mensaje + '\r\n.', 'QUIT'];

  return new Promise((resolver, rechazar) => {
    const s = tls.connect({ host, port: puerto, servername: host, minVersion: 'TLSv1.2' });
    let i = -1, buffer = '';
    s.setTimeout(15000, () => { s.destroy(); rechazar(new Error('SMTP: tiempo agotado')); });
    s.on('data', (d) => {
      buffer += d.toString();
      if (!buffer.endsWith('\r\n')) return;
      const ultima = buffer.trim().split('\r\n').pop();
      if (!/^\d{3} /.test(ultima)) return; // respuesta multilínea aún incompleta
      const codigo = Number(ultima.slice(0, 3));
      buffer = '';
      if (codigo >= 400) { s.destroy(); return rechazar(new Error('SMTP respondió ' + codigo)); }
      i++;
      if (i < pasos.length) s.write(pasos[i] + '\r\n'); else { s.end(); resolver(); }
    });
    s.on('error', rechazar);
  });
}

async function enviar(datos) {
  if (!config.smtp.host) {
    console.log('\n[correo] (SMTP no configurado) Para: ' + datos.para + '\nAsunto: ' + datos.asunto + '\n' + datos.texto + '\n');
    return;
  }
  try { await enviarSMTP(datos); } catch (e) { console.error('[correo] error al enviar a ' + datos.para + ':', e.message); }
}

module.exports = { enviar };
