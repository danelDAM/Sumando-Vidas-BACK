# Backend - Integración Stripe (base)

Pasos rápidos:

1. Copia `.env.example` a `.env` y completa `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y `FRONTEND_URL`.
2. Instala dependencias: `npm install`.
3. Arranca en modo desarrollo: `npm run dev`.

Variables recomendadas:

- `PORT=4242`
- `STRIPE_SECRET_KEY=...`
- `STRIPE_WEBHOOK_SECRET=...`
- `FRONTEND_URL=http://localhost:3000`
- `FRONTEND_URLS=http://localhost:3000`

Endpoints principales:

- `POST /api/payments/create-checkout-session` - Cuerpo: `{ line_items, success_url, cancel_url }`.
- `POST /api/payments/webhook` - Webhook de Stripe con body raw JSON.

Notas:

- Usa `stripe listen --forward-to localhost:4242/api/payments/webhook` para probar webhooks localmente.
- El webhook ya valida la firma y responde a los eventos principales de checkout.
- Si quieres personalizar el flujo de pago, solo tienes que ajustar `line_items` y las URLs de retorno.
