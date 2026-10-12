process.env.NODE_ENV ||= 'test';
process.env.FAKE_MONEY_ENABLED = 'true';
process.env.FRONTEND_URLS = 'http://localhost:5173';

const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const app = require('../src/index');
const config = require('../src/config');
const repository = require('../src/services/paymentRepository');

const ids = {
  campaign: '11111111-1111-4111-8111-111111111111',
  stop: '22222222-2222-4222-8222-222222222222',
  product: '33333333-3333-4333-8333-333333333333',
  participant: '44444444-4444-4444-8444-444444444444',
  donation: '55555555-5555-4555-8555-555555555555',
};

const originalMethods = {};
let records;
let participants;
let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  Object.assign(repository, originalMethods);
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  records = new Map();
  originalMethods.findCampaign = repository.findCampaign;
  originalMethods.findCampaignStop = repository.findCampaignStop;
  originalMethods.findProduct = repository.findProduct;
  originalMethods.findParticipant = repository.findParticipant;
  originalMethods.findDonation = repository.findDonation;
  originalMethods.findDonationByIdempotencyKey = repository.findDonationByIdempotencyKey;
  originalMethods.createDonation = repository.createDonation;
  originalMethods.updatePendingDonation = repository.updatePendingDonation;
  originalMethods.createParticipant = repository.createParticipant;
  originalMethods.publishParticipant = repository.publishParticipant;
  originalMethods.attachParticipantToPaidDonation = repository.attachParticipantToPaidDonation;

  participants = new Map();
  repository.findCampaign = async (id) => id === ids.campaign
    ? { id, currency: 'EUR', status: 'active' }
    : null;
  repository.findCampaignStop = async (id) => id === ids.stop
    ? { id, campaign_id: ids.campaign, status: 'ready', is_published: true }
    : null;
  repository.findProduct = async (id) => id === ids.product
    ? { id, campaign_id: ids.campaign, price_amount: 23.5, currency: 'EUR', is_active: true, is_published: true }
    : null;
  repository.findParticipant = async (id) => participants.get(id) || (id === ids.participant
    ? { id, participant_type: 'person', display_name: 'Existing Participant', status: 'active', publicly_listed: true, public_consent_at: '2026-10-04T00:00:00Z' }
    : null);
  repository.findDonation = async (id) => records.get(id) || null;
  repository.findDonationByIdempotencyKey = async (key) => [...records.values()]
    .find((donation) => donation.idempotency_key === key) || null;
  repository.createDonation = async (donation) => {
    const created = { ...donation, id: ids.donation, paid_at: null };
    records.set(created.id, created);
    return created;
  };
  repository.updatePendingDonation = async (id, updates) => {
    const current = records.get(id);
    if (!current || current.status !== 'pending') return null;
    const updated = { ...current, ...updates };
    records.set(id, updated);
    return updated;
  };
  repository.createParticipant = async (participant) => {
    const created = { ...participant, id: randomUUID() };
    participants.set(created.id, created);
    return created;
  };
  repository.publishParticipant = async (id, profile) => {
    const current = participants.get(id) || { id, status: 'active' };
    if (current.status !== 'active') return null;
    const updated = { ...current, ...profile, publicly_listed: true };
    participants.set(id, updated);
    return updated;
  };
  repository.attachParticipantToPaidDonation = async (id, participantId) => {
    const current = records.get(id);
    if (!current || current.status !== 'paid' || current.participant_id) return null;
    const updated = { ...current, participant_id: participantId };
    records.set(id, updated);
    return updated;
  };
  config.fakeMoneyEnabled = true;
  config.nodeEnv = 'test';
});

async function postPayment(body, idempotencyKey = randomUUID()) {
  return fetch(`${baseUrl}/api/payments/create-checkout-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify(body),
  });
}

async function postOutcome(id, outcome) {
  return fetch(`${baseUrl}/api/payments/${id}/fake-money`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ outcome }),
  });
}

test('creates a pending donation and approval is persisted and queryable', async () => {
  const response = await postPayment({
    campaignId: ids.campaign,
    campaignStopId: ids.stop,
    amount: 15,
    currency: 'EUR',
    donor: { name: 'Ada Lovelace', email: 'ada@example.com' },
  });
  const pending = await response.json();

  assert.equal(response.status, 201);
  assert.equal(pending.status, 'pending');
  assert.equal(records.get(ids.donation).campaign_stop_id, ids.stop);
  assert.equal(records.get(ids.donation).payment_provider, 'fake_money');
  assert.match(records.get(ids.donation).payment_reference, /^fm_/);

  const approval = await postOutcome(ids.donation, 'approved');
  const paid = await approval.json();
  assert.equal(approval.status, 200);
  assert.equal(paid.status, 'paid');
  assert.ok(paid.paidAt);

  const status = await fetch(`${baseUrl}/api/payments/${ids.donation}`);
  assert.equal((await status.json()).status, 'paid');
});

test('creates and publishes a person participant only after public donation approval', async () => {
  const response = await postPayment({
    campaignId: ids.campaign,
    amount: 15,
    participantType: 'person',
    donorName: 'Ada Lovelace',
    isAnonymous: false,
  });
  const pending = await response.json();

  assert.equal(response.status, 201);
  assert.equal(records.get(ids.donation).participant_id, null);
  assert.equal(participants.size, 0);

  const approval = await postOutcome(ids.donation, 'approved');
  assert.equal(approval.status, 200);
  const donation = records.get(ids.donation);
  const participant = participants.get(donation.participant_id);
  assert.equal(donation.status, 'paid');
  assert.ok(donation.paid_at);
  assert.equal(participant.participant_type, 'person');
  assert.equal(participant.display_name, 'Ada Lovelace');
  assert.equal(participant.status, 'active');
  assert.equal(participant.publicly_listed, true);
  assert.ok(participant.public_consent_at);
});

test('associates a visible company product donation with the company leaderboard type', async () => {
  const response = await postPayment({
    productId: ids.product,
    participant_type: 'company',
    donor_name: 'Acme Solidaria',
    is_anonymous: false,
  });
  assert.equal(response.status, 201);

  const approval = await postOutcome(ids.donation, 'approved');
  assert.equal(approval.status, 200);
  const donation = records.get(ids.donation);
  const participant = participants.get(donation.participant_id);
  assert.equal(donation.product_id, ids.product);
  assert.equal(donation.donation_type, 'product');
  assert.equal(donation.amount, 23.5);
  assert.equal(donation.status, 'paid');
  assert.equal(participant.participant_type, 'company');
  assert.equal(participant.display_name, 'Acme Solidaria');
  assert.equal(participant.publicly_listed, true);
  assert.ok(participant.public_consent_at);
});

test('reuses the participant ID supplied by the frontend after payment approval', async () => {
  const response = await postPayment({
    campaignId: ids.campaign,
    participantId: ids.participant,
    participantType: 'person',
    donorName: 'Existing Participant',
    isAnonymous: false,
    amount: 4,
  });
  assert.equal(response.status, 201);

  const approval = await postOutcome(ids.donation, 'approved');
  assert.equal(approval.status, 200);
  assert.equal(records.get(ids.donation).participant_id, ids.participant);
  assert.equal(participants.get(ids.participant).publicly_listed, true);
});

test('keeps anonymous paid donations out of participant leaderboards', async () => {
  const response = await postPayment({
    campaignId: ids.campaign,
    amount: 9,
    participantType: 'company',
    donorName: 'Private Company',
    isAnonymous: true,
  });
  assert.equal(response.status, 201);

  const approval = await postOutcome(ids.donation, 'approved');
  assert.equal(approval.status, 200);
  assert.equal(records.get(ids.donation).status, 'paid');
  assert.equal(records.get(ids.donation).participant_id, null);
  assert.equal(participants.size, 0);
});

test('does not create or publish a participant when a public-intent donation is cancelled', async () => {
  const response = await postPayment({
    campaignId: ids.campaign,
    amount: 9,
    participantType: 'person',
    donorName: 'Ada Lovelace',
    isAnonymous: false,
  });
  assert.equal(response.status, 201);

  const cancellation = await postOutcome(ids.donation, 'cancelled');
  assert.equal(cancellation.status, 200);
  assert.equal(records.get(ids.donation).participant_id, null);
  assert.equal(participants.size, 0);
});

test('an approval retry repairs a paid public donation missing its participant association', async () => {
  const response = await postPayment({
    campaignId: ids.campaign,
    amount: 7,
    participantType: 'person',
    donorName: 'Grace Hopper',
    isAnonymous: false,
  });
  assert.equal(response.status, 201);
  records.get(ids.donation).status = 'paid';
  records.get(ids.donation).paid_at = '2026-10-10T12:00:00.000Z';

  const retry = await postOutcome(ids.donation, 'approved');
  assert.equal(retry.status, 200);
  const donation = records.get(ids.donation);
  const participant = participants.get(donation.participant_id);
  assert.equal(donation.paid_at, '2026-10-10T12:00:00.000Z');
  assert.equal(participant.display_name, 'Grace Hopper');
  assert.equal(participant.publicly_listed, true);
});

test('supports cancelled and failed FakeMoney outcomes', async () => {
  for (const outcome of ['cancelled', 'failed']) {
    await postPayment({ campaignId: ids.campaign, amount: 5 });
    const response = await postOutcome(ids.donation, outcome);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, outcome);
  }
});

test('repeating an approval is idempotent and keeps the original paid timestamp', async () => {
  const key = randomUUID();
  await postPayment({ campaignId: ids.campaign, amount: 10 }, key);
  await postPayment({ campaignId: ids.campaign, amount: 10 }, key);
  assert.equal(records.size, 1);
  const firstResponse = await postOutcome(ids.donation, 'approved');
  const first = await firstResponse.json();
  const secondResponse = await postOutcome(ids.donation, 'approved');
  const second = await secondResponse.json();

  assert.equal(secondResponse.status, 200);
  assert.equal(second.paidAt, first.paidAt);
  assert.equal(records.get(ids.donation).status, 'paid');
});

test('rejects reuse of an idempotency key with different payment data', async () => {
  const key = randomUUID();
  await postPayment({ campaignId: ids.campaign, amount: 10 }, key);
  const response = await postPayment({ campaignId: ids.campaign, amount: 11 }, key);

  assert.equal(response.status, 409);
  assert.equal(records.size, 1);
});

test('rejects reusing an idempotency key with a different public participant identity', async () => {
  const key = randomUUID();
  const first = await postPayment({
    campaignId: ids.campaign,
    participantType: 'person',
    donorName: 'Ada Lovelace',
    isAnonymous: false,
    amount: 10,
  }, key);
  assert.equal(first.status, 201);

  const second = await postPayment({
    campaignId: ids.campaign,
    participantType: 'company',
    donorName: 'Different Company',
    isAnonymous: false,
    amount: 10,
  }, key);
  assert.equal(second.status, 409);
  assert.equal(records.size, 1);
});

test('requires participant type and visible name when public consent is requested', async () => {
  const missingType = await postPayment({ campaignId: ids.campaign, donorName: 'Ada', isAnonymous: false, amount: 3 });
  assert.equal(missingType.status, 400);

  const missingName = await postPayment({ campaignId: ids.campaign, participantType: 'person', isAnonymous: false, amount: 3 });
  assert.equal(missingName.status, 400);
  assert.equal(records.size, 0);
});

test('uses the database product price and rejects a manipulated amount', async () => {
  const response = await postPayment({ campaignId: ids.campaign, productId: ids.product, amount: 1 });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /no coincide/);
  assert.equal(records.size, 0);
});

test('rejects invalid campaign and stop identifiers and mismatched stops', async () => {
  const invalidCampaign = await postPayment({ campaignId: 'not-an-id', amount: 4 });
  assert.equal(invalidCampaign.status, 400);

  const invalidStop = await postPayment({ campaignId: ids.campaign, campaignStopId: 'not-an-id', amount: 4 });
  assert.equal(invalidStop.status, 400);

  repository.findCampaignStop = async () => ({ id: ids.stop, campaign_id: '66666666-6666-4666-8666-666666666666' });
  const wrongCampaign = await postPayment({ campaignId: ids.campaign, campaignStopId: ids.stop, amount: 4 });
  assert.equal(wrongCampaign.status, 400);
});

test('accepts a donation without linking a participant who lacks public consent', async () => {
  repository.findParticipant = async (id) => ({ id, status: 'active', publicly_listed: false, public_consent_at: null });
  const response = await postPayment({
    campaignId: ids.campaign,
    participantId: ids.participant,
    amount: 12,
  });

  assert.equal(response.status, 201);
  assert.equal(records.get(ids.donation).participant_id, null);
  assert.equal(records.get(ids.donation).metadata.public_participant_consent, false);
});

test('cannot enable FakeMoney in production, even when the flag is true', async () => {
  config.nodeEnv = 'production';
  const response = await postPayment({ campaignId: ids.campaign, amount: 8 });

  assert.equal(response.status, 503);
});

test('accepts explicit null optional IDs from frontend payloads', async () => {
  const response = await postPayment({
    campaignId: ids.campaign,
    campaignStopId: null,
    participantId: null,
    amount: 6,
  });

  assert.equal(response.status, 201);
  assert.equal(records.get(ids.donation).campaign_stop_id, null);
  assert.equal(records.get(ids.donation).participant_id, null);
});

test('rejects products that are not published', async () => {
  repository.findProduct = async (id) => ({
    id,
    campaign_id: ids.campaign,
    price_amount: 23.5,
    currency: 'EUR',
    is_active: true,
    is_published: false,
  });
  const response = await postPayment({ campaignId: ids.campaign, productId: ids.product });

  assert.equal(response.status, 400);
  assert.equal(records.size, 0);
});