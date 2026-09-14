const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Create a Checkout Session
router.post('/create-checkout-session', paymentController.createCheckoutSession);

// Note: webhook route is mounted in src/index.js with raw body parsing

module.exports = router;
