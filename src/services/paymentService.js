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
  const fieldsMatch = [
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
  return fieldsMatch
    && JSON.stringify(donation.metadata?.participant_intent ?? null)
      === JSON.stringify(candidate.metadata?.participant_intent ?? null);
}

function readAliasedValue(body, camelCaseKey, snakeCaseKey) {
  const camelCaseValue = body[camelCaseKey];
  const snakeCaseValue = body[snakeCaseKey];
  if (camelCaseValue !== undefined && snakeCaseValue !== undefined && camelCaseValue !== snakeCaseValue) {
    fail(400, `Los campos ${camelCaseKey} y ${snakeCaseKey} no coinciden.`);
  }
  return camelCaseValue !== undefined ? camelCaseValue : snakeCaseValue;
}

function participantIntent(donation) {
  return donation.metadata?.participant_intent || null;
}

async function createPrivateParticipant(donation, intent) {
  const requestedParticipantId = donation.participant_id || intent.participant_id;
  if (requestedParticipantId) {
    const participant = await getRecord('findParticipant', requestedParticipantId, 'participante');
    if (!participantIsActive(participant)) fail(409, 'El participante no está activo.');
    return participant;
  }

  return repository.createParticipant({
    participant_type: intent.participant_type,
    display_name: intent.display_name,
    email: donation.donor_email || null,
    publicly_listed: false,
    public_consent_at: null,
    status: 'active',
  });
}

async function publishPaidParticipant(donation) {
  const intent = participantIntent(donation);
  if (!intent || intent.is_anonymous) return donation;

  let participantId = donation.participant_id || intent.participant_id;
  if (!participantId) {
    const participant = await createPrivateParticipant(donation, intent);
    participantId = participant.id;
    const attached = await repository.attachParticipantToPaidDonation(donation.id, participantId);
    if (!attached) {
      const latest = await repository.findDonation(donation.id);
      if (!latest?.participant_id) fail(409, 'No se pudo asociar el participante a la donación pagada.');
      participantId = latest.participant_id;
      donation = latest;
    } else {
      donation = attached;
    }
  }

  const profile = await repository.publishParticipant(participantId, {
    participant_type: intent.participant_type,
    display_name: intent.display_name,
    public_consent_at: new Date().toISOString(),
  });
  if (!profile) fail(409, 'No se pudo activar la visibilidad pública del participante.');
  return donation;
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
  const requestedAnonymous = readAliasedValue(body, 'isAnonymous', 'is_anonymous');
  const isAnonymous = requestedAnonymous === undefined ? true : requestedAnonymous;
  if (typeof isAnonymous !== 'boolean') fail(400, 'isAnonymous debe ser true o false.');

  const requestedParticipantType = readAliasedValue(body, 'participantType', 'participant_type');
  const requestedDisplayName = readAliasedValue(body, 'donorName', 'donor_name');
  const rawDisplayName = requestedDisplayName ?? donor.name;
  let displayName = typeof rawDisplayName === 'string' ? rawDisplayName.trim() : '';
  const donorEmail = typeof donor.email === 'string' ? donor.email.trim().toLowerCase() : null;
  if (donor.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail)) fail(400, 'El email del donante no es válido.');

  const requestedParticipantId = body.participantId;
  if (requestedParticipantId !== undefined && requestedParticipantId !== null && !validId(requestedParticipantId)) {
    fail(400, 'El identificador de participante no es válido.');
  }

  let participantType = requestedParticipantType;
  let existingParticipant = null;
  if (!isAnonymous && requestedParticipantId) {
    existingParticipant = await getRecord('findParticipant', requestedParticipantId, 'participante');
    if (!participantIsActive(existingParticipant)) fail(400, 'El participante no está activo.');
    participantType = participantType || existingParticipant.participant_type;
    displayName = displayName || existingParticipant.display_name;
  }

  if (!isAnonymous) {
    if (!['person', 'company'].includes(participantType)) {
      fail(400, 'participantType debe ser person o company para una donación pública.');
    }
    if (!displayName) fail(400, 'Se requiere donorName para una donación pública.');
  }

  const donationDisplayName = requestedDisplayName !== undefined
    ? (typeof requestedDisplayName === 'string' ? requestedDisplayName.trim() : '')
    : (typeof donor.name === 'string' ? donor.name.trim() : '');
  const publicIntent = {
    is_anonymous: isAnonymous,
    participant_type: isAnonymous ? null : participantType,
    display_name: isAnonymous ? null : displayName,
    participant_id: isAnonymous ? null : (existingParticipant?.id || null),
  };

  const paymentReference = `fm_${randomUUID()}`;
  const donationData = {
    campaign_id: campaignId,
    campaign_stop_id: campaignStopId,
    product_id: product?.id || null,
    participant_id: null,
    donation_type: product ? 'product' : 'one_time',
    amount,
    currency,
    status: 'pending',
    idempotency_key: idempotencyKey,
    donor_name: donationDisplayName || null,
    donor_email: donorEmail || null,
    payment_provider: 'fake_money',
    payment_reference: paymentReference,
    metadata: {
      fake_money: true,
      fake_money_environment: config.nodeEnv,
      public_participant_consent: !isAnonymous,
      participant_intent: publicIntent,
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
  if (donation.status === targetStatus) {
    const consistentDonation = targetStatus === 'paid' ? await publishPaidParticipant(donation) : donation;
    return paymentStatus(consistentDonation);
  }
  if (donation.status !== 'pending') fail(409, 'No se puede cambiar el estado final de esta donación.');

  const intent = participantIntent(donation);
  const participant = outcome === 'approved' && intent && !intent.is_anonymous
    ? await createPrivateParticipant(donation, intent)
    : null;
  const updates = {
    status: targetStatus,
    paid_at: targetStatus === 'paid' ? new Date().toISOString() : null,
    metadata: { ...donation.metadata, fake_money_outcome: outcome },
  };
  if (intent) updates.participant_id = participant?.id || null;
  let updated = await repository.updatePendingDonation(id, updates);
  if (!updated) {
    updated = await repository.findDonation(id);
    if (updated?.status !== targetStatus) fail(409, 'La donación cambió de estado y no puede actualizarse.');
  }
  if (targetStatus === 'paid') updated = await publishPaidParticipant(updated);
  return paymentStatus(updated);
};

exports.getPaymentStatus = async (id) => {
  ensureFakeMoneyEnabled();
  const donation = await getRecord('findDonation', id, 'donación');
  return paymentStatus(donation);
};