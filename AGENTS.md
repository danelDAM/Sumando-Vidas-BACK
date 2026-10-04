# Backend Agent Instructions

These instructions apply to this Express backend only. Keep changes focused on this repository; the Vite frontend is maintained in the sibling `../POR ELLOSO/Por ellos web` repository.

## Project Conventions

- This is Node.js CommonJS. Use `require`/`module.exports` and preserve the existing Express structure.
- Keep HTTP parsing and response handling in `src/controllers`, route registration in `src/routes`, and business rules or external I/O in `src/services`.
- Configuration is loaded by `src/config.js` from the backend `.env`. Do not read, print, commit, or copy secret values.
- Available commands are `npm test`, `npm run dev`, and `npm start`. There is no backend build script.

## Git And Environments

- `develop` is the integration branch and maps to Supabase DEV project `lneaejwtcffridriuwpp` (`SumandoVidas-Dev`). `main` maps to Production project `hhapfybsavgenvfqyeyq` (`SumandoVidasDB`).
- Work on `feature/<topic>` branches from `develop`; merge by PR into `develop`, validate there, then promote by PR from `develop` to `main`. Do not develop directly on `main`.
- Do not assume branch protection is enabled. The CI workflow runs `npm test` for pushes/PRs to `develop` and `main`; require the check in GitHub branch settings when repository permissions allow.
- The Free Supabase organization has no preview database branching enabled. DEV and Production are separate projects; never substitute one project's URL/key for the other.
- FakeMoney may only be enabled against DEV. Production must have `FAKE_MONEY_ENABLED` unset/false and `NODE_ENV=production`.

## FakeMoney Payments

- FakeMoney is a development simulator, not a payment processor. It must never charge money or be enabled in production. It requires `FAKE_MONEY_ENABLED=true`; `NODE_ENV=production` always disables it.
- The flow is `POST /api/payments/create-checkout-session` to create a `pending` donation, `POST /api/payments/:id/fake-money` with `approved`, `cancelled`, or `failed` to simulate a result, and `GET /api/payments/:id` to retrieve server-confirmed status.
- Require a UUID `Idempotency-Key` header for checkout creation. Repeated identical requests must reuse the same donation; reusing a key for different payment data must fail. State transitions must be conditional on the current status being `pending`.
- Never accept a client-declared `paid` status, trust a client product price, or write to `donations` from the browser. A successful simulation must set `status='paid'` and `paid_at` on the server.
- Use stable UUID relationships (`campaign_id`, `campaign_stop_id`, `product_id`, `participant_id`); never persist a city or campaign name as a relation.
- Validate campaigns as active, stops as published and belonging to that campaign, and products as active and published. Product amount and currency come from `public.products.price_amount` and `currency`, not from the request.
- Link a participant only when its status is active and both `publicly_listed` and `public_consent_at` indicate valid public consent. Otherwise keep the donation anonymous; never invent participants.
- Mark simulator records with `payment_provider='fake_money'`, a unique `payment_reference`, and `metadata.fake_money=true` so development records are traceable. Do not record FakeMoney activity in `stripe_webhook_events` or claim that Stripe is implemented.

## Supabase Safety

- All writes use the backend-only `SUPABASE_SERVICE_ROLE_KEY`. Never use `VITE_SUPABASE_PUBLISHABLE_KEY` for server writes, expose the service-role key, or place it in frontend configuration.
- Keep row-level security enabled. Tests must use the in-memory repository mocks; do not write test donations to a remote Supabase project.
- Before any remote migration or data write, obtain explicit authorization and verify the target project. Apply migrations to DEV first, validate them, then promote through a reviewed PR and controlled Production migration. Do not delete existing donations. Migrations are maintained in the sibling frontend repository under `supabase/migrations`.
- Backend local `.env` must use the DEV `SUPABASE_URL` and that project's own `SUPABASE_SERVICE_ROLE_KEY`. The secret key belongs only on the server; never reuse Production's key in DEV or vice versa. The frontend's `VITE_SUPABASE_PUBLISHABLE_KEY` is not a server credential.
- Leaderboards are derived from `paid` donations by `monthly_leaderboard`, `historic_leaderboard`, and `public_city_leaderboard`. Do not maintain duplicate totals or update leaderboard views manually.
- After changing the database contract, keep the backend repository and the sibling frontend's migration/schema in sync. Do not infer column names: use the migrations. Relevant fields include product `price_amount`, campaign `status`, stop `is_published`, and participant `publicly_listed`/`public_consent_at`.

## Tests And Documentation

- Run `npm test` after backend changes. Payment tests should cover approval, cancellation/failure, repeat requests, invalid IDs, manipulated amounts, and participant consent without requiring Supabase credentials.
- Document API or environment changes in `README.md`. Keep secrets out of examples and test output.
- Keep `.github/workflows/ci.yml` aligned with the actual backend checks. CI must not require Supabase secrets or write to remote databases.
- Contact mail configuration belongs to `src/services/contactService.js`; preserve its existing validation and avoid coupling it to payment-provider configuration.