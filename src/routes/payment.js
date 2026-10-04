const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

router.post('/create-checkout-session', paymentController.createFakePayment);
router.post('/:id/fake-money', paymentController.simulateFakeMoney);
router.get('/:id', paymentController.getPaymentStatus);

module.exports = router;
