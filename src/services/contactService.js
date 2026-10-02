const nodemailer = require('nodemailer');
const {
  smtpHost,
  smtpPort,
  smtpUser,
  smtpPass,
  smtpFrom,
} = require('../config');

const recipient = 'associacionsumandovida@gmail.com';

exports.sendContactMessage = async ({ name, email, reason, message }) => {
  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom || !Number.isInteger(smtpPort) || smtpPort < 1) {
    const error = new Error('SMTP contact settings are incomplete');
    error.code = 'CONTACT_EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: smtpFrom,
    to: recipient,
    replyTo: { name, address: email },
    subject: `[Sumando Vidas] Nuevo mensaje: ${reason}`,
    text: `Nombre: ${name}\nEmail: ${email}\nMotivo: ${reason}\n\nMensaje:\n${message}`,
  });
};