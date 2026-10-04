const { randomUUID } = require('node:crypto');
const config = require('../config');
const repository = require('./paymentRepository');

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validOutcomes = new Set(['approved', 'cancelled', 'failed']);

function fail(statusCode, publicMessage) {
  const error = new Error(publicMessage);
  error.statusCode = statusCode;
  error.publicMessage = publicMessage;
  throw error;
}

function ensureFakeMoneyEnabled() {
  if (!config.fakeMoneyEnabled || config.nodeEnv === 'production') {
    fail(503, 'FakeMoney solo está disponible en desarrollo y debe habilitarse explícitamente.');
  }
}

function validId(value) {
  return typeof value === 'string' && uuidPattern.test(value);
}

function participantHasPublicConsent(participant) {
  return participant.publicly_listed === true && Boolean(participant.public_consent_at);
}

function participantIsActive(participant) {
  return participant.status === 'active';
}

function paymentStatus(donation) {
  return {
    donationId: donation.id,
    status: donation.status,
    amount: donation.amount,
    currency: donation.currency,
    paidAt: donation.paid_at || null,
    provider: donation.payment_provider || 'fake_money',
    paymentReference: donation.payment_reference || null,
  };
}

async function getRecord(method, id, label) {
  if (!validId(id)) fail(400, `El identificador de ${label} no es válido.`);
  const row = await repository[method](id);
  if (!row) fail(400, `${label} no existe.`);
  return row;
}

function checkoutResponse(donation) {
  return {
    ...paymentStatus(donation),
    statusUrl: `/api/payments/${donation.id}`,
    simulationUrl: `/api/payments/${donation.id}/fake-money`,
  };
}

function matchesIdempotentRequest(donation, candidate) {
  return [
    'campaign_id',
    'campaign_stop_id',
    'product_id',
    'participant_id',
    'donation_type',
    'amount',
    'currency',
    'donor_name',
    'donor_email',
  ]
    .every((field) => (donation[field] ?? null) === (candidate[field] ?? null));
}

exports.createFakePayment = async (body, headerKey) => {
  ensureFakeMoneyEnabled();
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'El cuerpo debe ser un objeto JSON.');
  const idempotencyKey = body.idempotencyKey || headerKey;
  if (!validId(idempotencyKey)) fail(400, 'Se requiere una clave de idempotencia UUID válida.');

  let campaign = null;
  let product = null;
  let campaignId = body.campaignId || null;

  if (body.productId !== undefined && body.productId !== null && body.productId !== '') {
    product = await getRecord('findProduct', body.productId, 'producto');
    if (product.is_active !== true || product.is_published !== true) fail(400, 'El producto no está disponible.');
    if (product.campaign_id && campaignId && product.campaign_id !== campaignId) {
      fail(400, 'El producto no pertenece a la campaña indicada.');
    }
    campaignId = campaignId || product.campaign_id || null;
  } else if (body.productId !== undefined && body.productId !== null) {
    fail(400, 'El identificador de producto no es válido.');
  }

  if (campaignId) {
    campaign = await getRecord('findCampaign', campaignId, 'campaña');
    if (campaign.status !== 'active') fail(400, 'La campaña no está activa.');
  } else if (body.campaignId !== undefined && body.campaignId !== null) {
    fail(400, 'El identificador de campaña no es válido.');
  }

  let campaignStopId = body.campaignStopId || null;
  if (campaignStopId) {
    if (!campaignId) fail(400, 'La parada requiere una campaña válida.');
    const stop = await getRecord('findCampaignStop', campaignStopId, 'parada');
    if (stop.campaign_id !== campaignId) fail(400, 'La parada no pertenece a la campaña indicada.');
    if (stop.is_published !== true || stop.status === 'cancelled') fail(400, 'La parada no está publicada o ya no está disponible.');
  } else if (body.campaignStopId !== undefined && body.campaignStopId !== null) {
    fail(400, 'El identificador de parada no es válido.');
  }

  let amount = body.amount;
  if (product) {
    const productPrice = Number(product.price_amount);
    if (!Number.isFinite(productPrice) || productPrice <= 0) fail(500, 'El producto no tiene un precio válido configurado.');
    if (amount !== undefined && Number(amount) !== productPrice) {
      fail(400, 'El importe no coincide con el precio configurado del producto.');
    }
    amount = productPrice;
  }
  amount = Number(amount);
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
    fail(400, 'El importe debe ser mayor que cero y tener como máximo dos decimales.');
  }

  const currency = String(product?.currency || campaign?.currency || body.currency || 'EUR').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail(400, 'La moneda no es válida.');
  if (body.currency !== undefined && body.currency !== null && !String(body.currency).trim()) {
    fail(400, 'La moneda no es válida.');
  }
  if (body.currency && String(body.currency).toUpperCase() !== currency) {
    fail(400, 'La moneda no coincide con la campaña o el producto.');
  }

  const donor = body.donor && typeof body.donor === 'object' && !Array.isArray(body.donor) ? body.donor : {};
  const donorName = typeof donor.name === 'string' ? donor.name.trim() : null;
  const donorEmail = typeof donor.email === 'string' ? donor.email.trim().toLowerCase() : null;
  if (donor.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail)) fail(400, 'El email del donante no es válido.');

  let participantId = null;
  if (body.participantId) {
    const participant = await getRecord('findParticipant', body.participantId, 'participante');
    if (!participantIsActive(participant)) fail(400, 'El participante no está activo.');
    if (participantHasPublicConsent(participant)) participantId = participant.id;
  } else if (body.participantId !== undefined && body.participantId !== null) {
    fail(400, 'El identificador de participante no es válido.');
  }

  const paymentReference = `fm_${randomUUID()}`;
  const donationData = {
    campaign_id: campaignId,
    campaign_stop_id: campaignStopId,
    product_id: product?.id || null,
    participant_id: participantId,
    donation_type: product ? 'product' : 'one_time',
    amount,
    currency,
    status: 'pending',
    idempotency_key: idempotencyKey,
    donor_name: donorName || null,
    donor_email: donorEmail || null,
    payment_provider: 'fake_money',
    payment_reference: paymentReference,
    metadata: {
      fake_money: true,
      fake_money_environment: config.nodeEnv,
      public_participant_consent: Boolean(participantId),
    },
  };

  const existing = await repository.findDonationByIdempotencyKey(idempotencyKey);
  if (existing) {
    if (!matchesIdempotentRequest(existing, donationData)) fail(409, 'La clave de idempotencia ya se usó con otros datos.');
    return checkoutResponse(existing);
  }

  let donation;
  try {
    donation = await repository.createDonation(donationData);
  } catch (error) {
    if (error.code !== '23505') throw error;
    donation = await repository.findDonationByIdempotencyKey(idempotencyKey);
    if (!donation || !matchesIdempotentRequest(donation, donationData)) {
      fail(409, 'La clave de idempotencia ya se usó con otros datos.');
    }
  }

  return checkoutResponse(donation);
};

exports.simulateFakeMoney = async (id, outcome) => {
  ensureFakeMoneyEnabled();
  const donation = await getRecord('findDonation', id, 'donación');
  if (donation.payment_provider !== 'fake_money' || donation.metadata?.fake_money !== true) {
    fail(400, 'La operación no pertenece a FakeMoney.');
  }
  if (!validOutcomes.has(outcome)) fail(400, 'El resultado debe ser approved, cancelled o failed.');

  const targetStatus = outcome === 'approved' ? 'paid' : outcome;
  if (donation.status === targetStatus) return paymentStatus(donation);
  if (donation.status !== 'pending') fail(409, 'No se puede cambiar el estado final de esta donación.');

  const updates = {
    status: targetStatus,
    paid_at: targetStatus === 'paid' ? new Date().toISOString() : null,
    metadata: { ...donation.metadata, fake_money_outcome: outcome },
  };
  let updated = await repository.updatePendingDonation(id, updates);
  if (!updated) {
    updated = await repository.findDonation(id);
    if (updated?.status !== targetStatus) fail(409, 'La donación cambió de estado y no puede actualizarse.');
  }
  return paymentStatus(updated);
};

exports.getPaymentStatus = async (id) => {
  ensureFakeMoneyEnabled();
  const donation = await getRecord('findDonation', id, 'donación');
  return paymentStatus(donation);
};