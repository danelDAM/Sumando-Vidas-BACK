const contactService = require('../services/contactService');

const allowedReasons = new Set(['general', 'volunteer', 'company', 'project', 'press']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateMessage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'El cuerpo de la solicitud debe ser un objeto JSON.' };
  }

  for (const field of ['name', 'email', 'reason', 'message']) {
    if (typeof body[field] !== 'string' || !body[field].trim()) {
      return { error: `El campo "${field}" es obligatorio.` };
    }
  }

  const message = {
    name: body.name.trim(),
    email: body.email.trim(),
    reason: body.reason.trim(),
    message: body.message.trim(),
  };

  if (!emailPattern.test(message.email)) {
    return { error: 'El email no tiene un formato válido.' };
  }

  if (!allowedReasons.has(message.reason)) {
    return { error: 'El motivo debe ser uno de: general, volunteer, company, project, press.' };
  }

  return { message };
}

exports.sendMessage = async (req, res) => {
  const validation = validateMessage(req.body);
  if (validation.error) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    await contactService.sendContactMessage(validation.message);
    res.status(200).json({ message: 'Tu mensaje se ha enviado correctamente. Te responderemos lo antes posible.' });
  } catch (err) {
    console.error('Contact email delivery failed', {
      code: err.code || 'UNKNOWN',
      responseCode: err.responseCode || null,
      command: err.command || null,
    });
    res.status(500).json({ error: 'No se pudo enviar el mensaje. Inténtalo de nuevo más tarde.' });
  }
};