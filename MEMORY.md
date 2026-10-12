# MEMORY.md

Backend state snapshot. Update when it changes. Last review: 2026-10-11. Cross-repo state (frontend, database, environments) is in `../Por ellos web/MEMORY.md`.

## Git

- Remote `back` → `github.com/danelDAM/Sumando-Vidas-BACK`. Branches `develop` (DEV) and `main` (Production).
- Local `develop` is in sync with `back/develop` (`6d8e72f`) but has **uncommitted** work: public participant flow in `src/services/paymentService.js`, `src/services/paymentRepository.js`, `test/payment.test.js`, plus doc updates (`AGENTS.md`, `README.md`, `docs/ENVIRONMENTS.md`) and the new `CLAUDE.md`/`MEMORY.md`.
- CI: `.github/workflows/ci.yml` runs `npm ci && npm test` on Node 22 for push/PR to `develop` and `main`. Branch protection not configured (needs admin).
- `npm test`: 28/28 passing on 2026-10-11.

## Local environment

- `.env` defines `PORT`, `NODE_ENV`, `FAKE_MONEY_ENABLED`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (DEV project `lneaejwtcffridriuwpp`), `FRONTEND_URL`, `FRONTEND_URLS`.
- `SMTP_*` are **not** in `.env`: `POST /api/contact` returns 500 locally until they are provided.

## API

- `POST /api/contact` `{ name, email, reason, message }`; reason ∈ `general|volunteer|company|project|press`; sends to `associacionsumandovida@gmail.com` with the sender as Reply-To.
- `POST /api/payments/create-checkout-session` (UUID `Idempotency-Key` header, or `idempotencyKey` in the body) → `201` pending donation: `donationId, status, amount, currency, paidAt, provider, paymentReference, statusUrl, simulationUrl`.
- `POST /api/payments/:id/fake-money` `{ outcome: approved|cancelled|failed }`; `GET /api/payments/:id`.
- All payment routes return 503 unless FakeMoney is enabled and not in production, or when Supabase is unconfigured.

## Public participant flow (uncommitted, tests passing)

- Request fields: `isAnonymous` (default `true`), `participantType` (`person|company`), `donorName`, optional `participantId`; snake_case aliases accepted and must match.
- Stored as `metadata.participant_intent`; part of the idempotency comparison.
- On `approved`: create participant (private first, then attach via `attachParticipantToPaidDonation`, then `publishParticipant` sets `publicly_listed=true`, `public_consent_at`). Retrying an approval repairs a paid donation missing its participant. `cancelled`/`failed` create nothing.
- Docs (`AGENTS.md`, `README.md`) were updated on 2026-10-11 to describe this flow instead of "never create participants".

## Open issues

- **Security, unresolved:** with `isAnonymous=false` and an existing `participantId`, `publishParticipant` overwrites that participant's `display_name`/`participant_type` and sets it public. Any client that knows an active participant's UUID can rename and publish it. Needs a decision (e.g. only reuse participants that are already public, never overwrite profile fields of an existing one).
- Participant creation is not atomic with the donation update; a failure between steps leaves a private orphan participant (the approval retry repairs the link, not the orphan).
- Stripe is not implemented; `stripe_webhook_events` stays unused. No production payment provider exists yet.
