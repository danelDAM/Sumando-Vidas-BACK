const express = require('express');
const cors = require('cors');
const { port, allowedOrigins } = require('./config');

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true,
  })
);

const paymentController = require('./controllers/paymentController');
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);

app.use(express.json());

const paymentRoutes = require('./routes/payment');
app.use('/api/payments', paymentRoutes);

const contactRoutes = require('./routes/contact');
app.use('/api/contact', contactRoutes);

app.get('/', (req, res) => res.send('Backend preparado para Stripe'));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'El cuerpo de la solicitud debe ser JSON válido.' });
    return;
  }

  next(err);
});

if (require.main === module) {
  app.listen(port, () => console.log(`Server listening on port ${port}`));
}

module.exports = app;
