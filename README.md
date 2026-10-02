# Backend - Sumando Vidas

Pasos rápidos:

1. Copia `.env.example` a `.env` y configura SMTP y CORS. Stripe es opcional hasta que tengas una cuenta.
2. Instala dependencias: `npm install`.
3. Arranca en modo desarrollo: `npm run dev`.

Variables recomendadas:

- `PORT=4242`
- `STRIPE_SECRET_KEY=...` - Opcional mientras los pagos estén desactivados.
- `STRIPE_WEBHOOK_SECRET=...` - Opcional mientras los pagos estén desactivados.
- `FRONTEND_URL=http://localhost:5173` - Origen usado para las URLs de retorno de Stripe.
- `FRONTEND_URLS=http://localhost:5173` - Lista de orígenes CORS permitidos, separados por comas.
- `SMTP_HOST=...` - Servidor SMTP del proveedor de correo.
- `SMTP_PORT=587` - Puerto SMTP; se usa TLS implícito automáticamente en el puerto 465.
- `SMTP_USER=...` y `SMTP_PASS=...` - Credenciales SMTP, solo en el backend.
- `SMTP_FROM=...` - Dirección autorizada por el proveedor para enviar correo.

Para desarrollo local, incluye `http://localhost:5173` en `FRONTEND_URLS`. Al desplegar el frontend, añade su origen real a esa lista, separado por una coma; no uses una URL con ruta. No se presupone ningún dominio de producción. Mantén `SMTP_PASS` y las claves de Stripe únicamente en el `.env` del backend y no las publiques ni las incluyas en el frontend.

Stripe permanece desactivado si falta cualquiera de sus dos variables: el backend puede arrancar y el contacto sigue disponible, pero los endpoints de pagos responden `503`. Cuando tengas cuenta, rellena ambas variables con credenciales válidas y reinicia el backend para activar el flujo ya preparado.

Endpoints principales:

- `POST /api/payments/create-checkout-session` - Cuerpo: `{ line_items, success_url, cancel_url }`.
- `POST /api/payments/webhook` - Webhook de Stripe con body raw JSON.
- `POST /api/contact` - Cuerpo: `{ name, email, reason, message }`; `reason` admite `general`, `volunteer`, `company`, `project` o `press`. Envía el mensaje a `associacionsumandovida@gmail.com`.

Notas:

- Usa `stripe listen --forward-to localhost:4242/api/payments/webhook` para probar webhooks localmente.
- El webhook ya valida la firma y responde a los eventos principales de checkout.
- Si quieres personalizar el flujo de pago, solo tienes que ajustar `line_items` y las URLs de retorno.
- Ejecuta `npm test` para validar el endpoint de contacto. Las pruebas simulan el proveedor SMTP y no envían correos reales.

## Prueba local del formulario

1. Completa en `.env` las credenciales SMTP de una cuenta/proveedor autorizado y configura `SMTP_FROM` con una dirección permitida por ese proveedor.
2. Asegura que `FRONTEND_URLS` incluye `http://localhost:5173` y arranca el backend con `npm run dev` (puerto `4242` por defecto).
3. Arranca el frontend Vite con `npm run dev` en su repositorio y envía el formulario de contacto. Su servicio usa `http://localhost:4242` de forma predeterminada.
4. Comprueba que el correo llega al destinatario y que responder al mensaje usa el email indicado en el formulario.
