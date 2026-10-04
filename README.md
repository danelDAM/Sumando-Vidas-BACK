# Backend - Sumando Vidas

Backend Express para contacto y pagos de desarrollo con FakeMoney. FakeMoney no realiza cobros ni llama a proveedores externos. Stripe no forma parte de este flujo.

La estrategia de ramas Git y la separación DEV/Production de Supabase están documentadas en [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md).

## Configuración

1. En desarrollo, configura `.env` con la URL y una clave `sb_secret_...` propia de `SumandoVidas-Dev` (`lneaejwtcffridriuwpp`). Nunca copies la clave de Production a DEV.
2. FakeMoney requiere `NODE_ENV=development`, una clave de servidor válida y `FAKE_MONEY_ENABLED=true`. Si falta configuración responde `503`; en producción siempre está deshabilitado.
3. Instala e inicia el backend con `npm install` y `npm run dev` (puerto `4242` por defecto).

Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` son de cliente y Vite solo las carga desde el `.env` del proyecto frontend. Este workspace contiene únicamente el backend; añadirlas al `.env` de aquí no configura el frontend.

Variables relevantes:

- `FAKE_MONEY_ENABLED=true` - Habilitación explícita; solo funciona fuera de producción.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` - Acceso del backend a Supabase. Todas las escrituras en `public.donations` se realizan desde el servidor.
- `FRONTEND_URLS=http://localhost:5173` - Orígenes CORS permitidos, separados por comas.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` - Configuración del formulario de contacto.

El esquema inicial, las semillas, el leaderboard de ciudades y la migración FakeMoney están aplicados en DEV. La migración aditiva FakeMoney también se aplicó a Production con autorización explícita; no uses Production para nuevas pruebas simuladas. Los archivos fuente están en `supabase/migrations` del repositorio frontend. Todas las escrituras del backend usan exclusivamente `SUPABASE_SERVICE_ROLE_KEY`; `VITE_SUPABASE_PUBLISHABLE_KEY` no sirve para escribir.

## Flujo FakeMoney

El cliente genera un UUID nuevo por intento de pago y lo conserva para reintentar exactamente esa operación. Puede enviarlo en el header `Idempotency-Key`.

`POST /api/payments/create-checkout-session` crea una fila `pending`. Los IDs son UUIDs estables de Supabase, no nombres de campaña o ciudad. Para una donación:

```json
{
	"campaignId": "UUID-de-campaigns",
	"campaignStopId": "UUID-de-campaign-stops",
	"amount": 12.5,
	"currency": "EUR",
	"donor": { "name": "Nombre", "email": "persona@example.com" }
}
```

Para un producto, envía `productId`; el backend obtiene precio y moneda de `public.products`. Si se incluye `amount`, debe coincidir con el precio persistido. `campaignStopId` y `participantId` son opcionales, pero se validan en el servidor. Un participante sin consentimiento público válido no queda ligado a la donación ni aparece en los rankings personales. No se crea ningún participante automáticamente.

La respuesta incluye `donationId`, `status`, `statusUrl` y `simulationUrl`. FakeMoney no redirige a una pasarela: en desarrollo se simula el resultado explícitamente:

```json
POST /api/payments/{donationId}/fake-money
{ "outcome": "approved" }
```

`outcome` admite `approved`, `cancelled` o `failed`. `approved` transiciona `pending` a `paid` y asigna `paid_at`; repetir la misma aprobación es idempotente. Los estados finales no se pueden cambiar. El estado confirmado se obtiene con `GET /api/payments/{donationId}`; una URL de retorno del navegador no confirma ningún pago.

Ejemplo local:

```powershell
$key = [guid]::NewGuid().ToString()
$start = Invoke-RestMethod -Method Post -Uri http://localhost:4242/api/payments/create-checkout-session -Headers @{ 'Idempotency-Key' = $key } -ContentType 'application/json' -Body '{"campaignId":"UUID-de-campaigns","amount":12.5,"currency":"EUR"}'
Invoke-RestMethod -Method Post -Uri "http://localhost:4242$($start.simulationUrl)" -ContentType 'application/json' -Body '{"outcome":"approved"}'
Invoke-RestMethod -Method Get -Uri "http://localhost:4242$($start.statusUrl)"
```

Sustituye los UUID de ejemplo por IDs existentes en la base de desarrollo. Cambia el resultado por `cancelled` o `failed` para probar esos estados.

## Integración del frontend

El frontend vive en el repositorio hermano `Por ellos web`. Sus servicios usan `VITE_API_URL` o `http://localhost:4242` como endpoint base y las variables `VITE_SUPABASE_*` de ese repo apuntan a DEV durante desarrollo. El flujo manda IDs estables y una clave `Idempotency-Key`; la simulación está disponible solo en desarrollo. `DonationStatusPage` consulta el estado en el backend y muestra éxito únicamente al recibir `paid`.

Después de verificar `paid`, invalida y vuelve a solicitar los leaderboards en `src/services/publicData.ts` (mensual, histórico y ciudades). Las vistas leen las donaciones `paid`; no mantengas contadores duplicados en el backend.

## Contacto y pruebas

`POST /api/contact` acepta `{ name, email, reason, message }`; `reason` admite `general`, `volunteer`, `company`, `project` o `press` y envía el mensaje a `associacionsumandovida@gmail.com`.

Ejecuta `npm test`. Las pruebas de pagos usan un repositorio en memoria y no escriben en Supabase. Este backend CommonJS no necesita compilación y no define un script `build`.

## Ramas y CI

Usa `develop` para integrar y probar cambios en Supabase DEV; `main` corresponde a Production. Crea ramas `feature/<tema>` desde `develop` y promueve los cambios mediante PR de `feature/*` a `develop`, y luego de `develop` a `main`. Los workflows de GitHub ejecutan `npm test` en PRs/pushes a ambas ramas una vez que se publiquen. La guía completa, incluidos los identificadores de proyectos, las variables por entorno y el orden de migraciones, está en [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md).
