const paymentService = require('../services/paymentService');

exports.createFakePayment = async (req, res) => {
  try {
    const payment = await paymentService.createFakePayment(req.body, req.get('idempotency-key'));
    res.status(201).json(payment);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.publicMessage || 'No se pudo iniciar el pago simulado.' });
  }
};

exports.simulateFakeMoney = async (req, res) => {
  try {
    const payment = await paymentService.simulateFakeMoney(req.params.id, req.body?.outcome);
    res.json(payment);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.publicMessage || 'No se pudo actualizar el pago simulado.' });
  }
};

exports.getPaymentStatus = async (req, res) => {
  try {
    const payment = await paymentService.getPaymentStatus(req.params.id);
    res.json(payment);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.publicMessage || 'No se pudo consultar el estado del pago.' });
  }
};
