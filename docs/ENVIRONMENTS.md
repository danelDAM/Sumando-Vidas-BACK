# Git y entornos Supabase

## Estructura creada

Los dos repositorios comparten el mismo flujo de ramas:

| Rama | Uso | Supabase |
| --- | --- | --- |
| `develop` | Integración y pruebas antes de publicar | `SumandoVidas-Dev` (`lneaejwtcffridriuwpp`) |
| `main` | Código que se despliega a producción | `SumandoVidasDB` (`hhapfybsavgenvfqyeyq`) |
| `feature/<tema>` | Trabajo aislado; se crea desde `develop` y se integra mediante PR | Sin acceso a una base propia; se prueba en DEV tras integrar |

Las ramas `develop` ya están publicadas en ambos repositorios. Los cambios de trabajo locales continúan sin commit: crear una rama no publica ni commitea esos cambios. `main` se mantiene como la rama de producción; no desarrolles directamente sobre ella.

La organización Supabase está en el plan Free y no tiene branching/preview databases habilitado. Por eso se creó un proyecto Supabase DEV separado en vez de simular una rama de base de datos. El proyecto de producción existente no se renombró ni se clonó.

## Trabajo diario

1. Actualiza `develop` y crea una rama `feature/<tema>` desde ella.
2. Implementa y valida cambios localmente; para el backend ejecuta `npm test`, y para el frontend `npm run build`.
3. Abre un PR de `feature/<tema>` hacia `develop`. Revisa que los cambios de esquema incluyan una migración aditiva bajo `supabase/migrations` en el repo frontend.
4. Integra en `develop` y prueba el frontend/backend contra `SumandoVidas-Dev`. FakeMoney se permite solamente allí y las donaciones de prueba deben permanecer identificadas como `payment_provider='fake_money'` y `metadata.fake_money=true`.
5. Cuando esté validado, abre un PR de `develop` hacia `main`. Revisa manualmente cada migración y las variables del despliegue de producción.
6. Tras aprobar y desplegar `main`, aplica las migraciones pendientes en `SumandoVidasDB`. Nunca copies registros de donaciones de DEV a producción.

Los dos repositorios incluyen workflows de CI para ejecutar al hacer push o abrir PR contra `develop`/`main`: `npm test` para backend y `npm run build` para frontend. Estos workflows están en los cambios locales y empezarán a ejecutarse en GitHub cuando se commiteen y publiquen. Configura protección de ramas en GitHub para exigir PR y el check correspondiente (`Backend CI / test` o `Frontend CI / build`) antes de integrar en `main`; las reglas remotas no se configuraron porque requieren permisos de administración.

## Bases Supabase

- DEV: dashboard `https://supabase.com/dashboard/project/lneaejwtcffridriuwpp`. Instancia independiente, región `eu-west-1`. Se cargaron el esquema inicial, las semillas, la vista de ranking por ciudad y la migración FakeMoney.
- Producción: dashboard `https://supabase.com/dashboard/project/hhapfybsavgenvfqyeyq`. Esta base conserva los datos reales. La migración FakeMoney se aplicó aquí con autorización explícita anterior; no la uses para nuevas pruebas FakeMoney. Sigue presente una donación de prueba anónima de 1 EUR creada anteriormente, marcada `fake_money` y sin campaña, parada ni participante, por lo que no aparece en los rankings.
- Branching de Supabase: no disponible en la organización actual; la conexión GitHub está desconectada y el botón de crear ramas no está habilitado. Si el plan lo permite más adelante, las ramas preview de Supabase pueden reemplazar bases efímeras para PR; no reemplazan los proyectos DEV y Production persistentes.

Cada proyecto tiene su propia URL y sus propias claves. Nunca reutilices la clave `sb_secret_...` de Production en DEV o viceversa.

## Variables locales

Backend, `.env` del repo backend:

```env
NODE_ENV=development
FAKE_MONEY_ENABLED=true
SUPABASE_URL=https://lneaejwtcffridriuwpp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_<clave-del-proyecto-DEV>
```

La URL DEV está configurada localmente. La clave de servicio quedó vacía intencionalmente al quitar del `.env` la secret que apuntaba a Production. Genera/copia una secret propia de DEV desde **SumandoVidas-Dev → Project Settings → API Keys** y pégala directamente en el `.env` local, sin compartirla en chat. Hasta configurarla, deja `FAKE_MONEY_ENABLED=false`. Reinicia `npm run dev` después de cambiar `.env`.

Frontend, `.env.local` del repo frontend:

```env
VITE_SUPABASE_URL=https://lneaejwtcffridriuwpp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<publishable-key-del-proyecto-DEV>
VITE_API_URL=http://localhost:4242
```

Las dos primeras variables ya apuntan al proyecto DEV. La publishable key puede estar en el frontend; nunca pongas allí una `sb_secret_...`, una service-role legacy ni otra credencial administrativa. `.env` y `.env.local` están ignorados por Git.

Producción requiere variables configuradas en el entorno de despliegue, no en archivos versionados: URL y publishable key de Production para Vite; URL y secret/service-role propia de Production para el backend. FakeMoney debe quedar desactivado y Stripe no forma parte del flujo habilitado.

## Migraciones y datos

- Mantén el esquema bajo `POR ELLOSO/Por ellos web/supabase/migrations` y aplica las migraciones en orden a DEV primero.
- Usa SQL aditivo y reversible cuando sea viable. No borres tablas ni donaciones existentes.
- Tras validar el código y migración en DEV, promuévela a Production mediante PR/revisión y una aplicación controlada.
- Los leaderboards se derivan de `donations` pagadas; no guardes totales duplicados. FakeMoney sin IDs válidos de campaña/parada/participante queda fuera de las clasificaciones correspondientes.
- No registres simulaciones en `stripe_webhook_events`.

## Estado de la configuración

`SumandoVidas-Dev` es el destino de trabajo y tiene esquema/semillas cargados. Las ramas `develop` existen en ambos remotos, pero los cambios locales no se han commiteado. El `.env` del backend apunta a DEV y no contiene una secret válida aún; FakeMoney permanece apagado hasta que pegues la secret DEV. El proyecto Production no se usa desde los `.env` locales.
