# CLAUDE.md

@AGENTS.md
@MEMORY.md

`AGENTS.md` holds the backend rules and is the source of truth; `MEMORY.md` holds the current backend state. The frontend, the Supabase migrations and the shared cross-repo memory live in the sibling repo `../Por ellos web` (see its `CLAUDE.md` and `MEMORY.md`).

## Workspace

- Backend (this repo): `C:\Users\Danell\Desktop\SUMANDO VIDA\Por ellos back` — Express 4, CommonJS, `@supabase/supabase-js`, nodemailer. Node 22 in CI.
- Frontend (sibling): `C:\Users\Danell\Desktop\SUMANDO VIDA\Por ellos web` — Vite + React + TS. Its rules are in `../Por ellos web/AGENTS.md`.
- Database schema: only in `../Por ellos web/supabase/migrations`. Read it before assuming a column name.

## Commands

- `npm run dev` (nodemon, port 4242), `npm start`, `npm test` (`node --test`, picks up `test/*.test.js`). No build, no linter.

## Where things are

- `src/index.js`: Express app (CORS from `allowedOrigins`, JSON body, `/api/payments`, `/api/contact`, JSON parse errors → 400). Exports `app`; only listens when run directly.
- `src/config.js`: all env reading. `fakeMoneyEnabled` is already false when `NODE_ENV=production`.
- Payments: `routes/payment.js` → `controllers/paymentController.js` (maps `err.statusCode`/`err.publicMessage`) → `services/paymentService.js` (all rules; `fail(status, msg)` helper) → `services/paymentRepository.js` (the only Supabase access, service-role client created lazily; 503 if unconfigured).
- Contact: `routes/contact.js` → `controllers/contactController.js` (validation, allowed reasons) → `services/contactService.js` (nodemailer, fixed recipient).
- Tests: `test/payment.test.js` replaces repository methods with an in-memory store and toggles `config` flags; `test/contact.test.js` sets fake `SMTP_*` env vars and stubs the service / `nodemailer.createTransport`. Both start the real `app` on an ephemeral port. Follow that pattern; never hit Supabase or SMTP.

## Working notes for Claude

- Never print or copy values from `.env`; checking whether a key is set is fine (e.g. `sed 's/=.*/=<redacted>/' .env`).
- User-facing API error messages are in Spanish; keep that style.
- Run `npm test` after any backend change; update `README.md` for API/env changes and `MEMORY.md` when project state changes.
- The user writes in Spanish; reply in Spanish.
