# MikoshiTracker — Revisión de seguridad y estado del proyecto

> Auditoría realizada el 2026-05-17 sobre el commit `f23a3f6` (rama `main`).
> Alcance: auditoría estática completa de `apps/`, `packages/`, contenedores y
> dependencias, más verificación en tiempo de ejecución.

## Veredicto

**El código es seguro de adoptar.** No se encontró código malicioso, backdoors,
telemetría oculta ni mecanismos de exfiltración de datos. La aplicación **no
"roba datos"**: las únicas llamadas de red salientes van al propio API que tú
configuras. El aislamiento entre usuarios (multiusuario) es **correcto**.

El proyecto **NO está listo para exponerse directamente en Internet** sin el
hardening descrito más abajo (sin rate limiting, sin protección contra fuerza
bruta, sin TLS, sin cabeceras de seguridad). Esos arreglos se aplican en el
mismo lote de trabajo que esta revisión — ver `docs/PUBLIC-DEPLOYMENT.md`.

## Resumen por severidad

| Sev.     | Hallazgo                                                            | Estado                                                 |
| -------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| 🔴 Alta  | Sin rate limiting ni protección anti fuerza bruta en login          | Arreglado (hardening)                                  |
| 🔴 Alta  | Caddy sirve solo HTTP plano — tokens/sesiones en claro              | Arreglado (plantilla TLS)                              |
| 🟠 Media | Sin cabeceras de seguridad HTTP (helmet)                            | Arreglado (hardening)                                  |
| 🟠 Media | Primer usuario registrado = admin (carrera en despliegue público)   | Mitigado (doc + recomendación)                         |
| 🟠 Media | 65 vulnerabilidades en dependencias (`pnpm audit`), varias `high`   | Recomendado actualizar                                 |
| 🟡 Baja  | Contenedores corren como `root` dentro del contenedor               | Arreglado (`USER node`)                                |
| 🟡 Baja  | Repositorios Prisma de hábitos hacen `update` por `id` sin `userId` | Sin riesgo actual (defensa en profundidad recomendada) |
| 🟡 Baja  | Sin expiración ni scope en los tokens de API personales             | Aceptable; documentado                                 |
| ℹ️ Info  | Sin ESLint, sin CI, sin reporte de cobertura                        | Recomendado añadir                                     |

---

## 1. ¿Roba datos? ¿Hay backdoors? — NO

- **Sin ejecución dinámica de código:** cero ocurrencias de `eval`,
  `new Function`, `child_process`, `execSync`/`spawnSync` en código de
  aplicación.
- **Sin hosts externos:** un grep de `http(s)://` en todo `apps/` y `packages/`
  (excluyendo tests) no devuelve **ningún** dominio de terceros. Las únicas
  URLs son `localhost`/`127.0.0.1`, el servicio interno `api:3001`, y
  `habit.example.com` (un placeholder en la documentación del plugin).
- **Sin telemetría/analytics:** la web (Next.js) no incluye Sentry, PostHog,
  Google Analytics, Vercel Analytics ni `sendBeacon`. `NEXT_TELEMETRY_DISABLED=1`
  está fijado en `Dockerfile.web`.
- **Sin scripts de instalación sospechosos:** el único `postinstall`
  (`package.json:8`) ejecuta `prisma generate` — legítimo. No hay
  `preinstall`/`prepare` en ningún `package.json`.
- **Sin git hooks activos:** `.git/hooks/` solo contiene ficheros `.sample`.
- **MCP / plugin OpenClaw:** `packages/mcp` y `packages/openclaw-plugin` solo
  hacen `fetch` contra el `MIKOSHI_TRACKER_API_URL` que aporta el operador; rechazan
  URLs no http(s) y redactan los tokens en los mensajes de error.

Conclusión: el proyecto es una app self-hosted cerrada sobre sí misma. Tus
datos viven en tu SQLite y no salen a ningún sitio.

## 2. Autenticación y tokens

Implementación con `better-auth` (librería reputada) — `apps/api/src/auth/`.

- **Sesiones:** cookie de sesión gestionada por better-auth. Toda ruta
  protegida llama a `requireSession`/`requireAuthenticatedUser`
  (`apps/api/src/auth/session.ts`).
- **Tokens de API personales** (`apps/api/src/auth/api-token.ts`): generados con
  `randomBytes(24)` (192 bits de entropía), almacenados como **hash SHA-256**,
  nunca en claro. Existe migración automática de tokens legacy en arranque
  (`migrateLegacyPersonalApiTokens`). SHA-256 sin sal es adecuado aquí porque el
  token es aleatorio de alta entropía (no una contraseña).
  - _Limitación (baja):_ un token por usuario, sin expiración ni scopes; el
    "reset" rota en sitio. Aceptable para un API personal; documentado.
- **Política de contraseñas:** `auth.ts` habilita `emailAndPassword` sin
  configurar longitud mínima → se usa el valor por defecto de better-auth
  (8 caracteres). Recomendado subir `minPasswordLength` si se expone público.
- **Proxy de autenticación hecho a mano** (`server.ts:38-145`): reenvía
  `/api/auth/*` al handler de better-auth copiando **todas** las cabeceras. No
  es explotable porque better-auth deriva su `baseURL` del entorno, no del
  header `Host`, pero es código no estándar a vigilar en futuras versiones.

## 3. Multiusuario y aislamiento entre cuentas — CORRECTO

Cada usuario solo ve sus datos. Verificado leyendo **todos** los repositorios:

- Hábitos: `findOwnedHabitRecord`/`findOwnedHabitDetailRecord`/
  `listHabitRecordsByFilter` filtran siempre por `userId`
  (`habit.repository.ts`). Las mutaciones (`updateHabitRecord`,
  `setHabitActiveState`) reciben un `id` "desnudo", **pero** el servicio
  (`habit.service.ts`) llama antes a `requireOwnedHabit`, que verifica la
  propiedad — no hay IDOR.
- Check-ins: `findOwnedHabitForCheckin` filtra por `{id, userId}` y lanza error
  si no hay match (`checkin.repository.ts`).
- Today y Stats: todas las consultas filtran por `userId`
  (`today.controller.ts`, `stats.repository.ts`).
- `assertOwnsUser` protege la ruta `/api/users/:userId/ownership`.

_Recomendación de defensa en profundidad (baja):_ hacer que
`updateHabitRecord`/`setHabitActiveState` también incluyan `userId` en el
`where`, para que un futuro cambio descuidado del servicio no introduzca un
IDOR. No es un fallo actual.

## 4. Inyecciones — SIN RIESGO

- **SQL:** sin `$queryRaw`/`$executeRaw`; todo pasa por Prisma con consultas
  parametrizadas.
- **XSS:** sin `dangerouslySetInnerHTML` en la web. La página de docs OpenAPI
  (`openapi.ts`) genera HTML, pero escapa toda interpolación con `escapeHtml()`
  y los datos provienen de definiciones de ruta estáticas, no de entrada de
  usuario.
- **Validación de entrada:** todos los endpoints validan el cuerpo/query con
  esquemas Zod (`@mikoshi-tracker/contracts`). Entrada inválida → 400.

## 5. Modelo de administrador

`apps/api/src/auth/registration.ts`: el **primer usuario registrado se convierte
en admin** automáticamente; si no hay admin, se promociona al usuario más
antiguo. El registro se puede desactivar (`/api/admin/registration`).

- _Riesgo (medio) en despliegue público:_ entre que el servicio arranca y se
  registra el operador legítimo, un atacante podría registrarse primero y
  quedarse con el rol admin. **Mitigación:** desplegar con el registro
  desactivado y registrar la cuenta admin antes de exponer el puerto, o
  registrarse de inmediato. Ver `docs/PUBLIC-DEPLOYMENT.md`.
- La ruta de test `/api/test/session/promote-admin` está correctamente cerrada
  con `NODE_ENV !== "test"` → 404 en producción.

## 6. CORS y secretos

- **CORS** (`cors.ts` + `env.ts`): `origin` es un **array de orígenes** derivado
  de `CORS_ORIGIN`/`APP_BASE_URL`; nunca es `*`. Con `credentials: true` esto es
  correcto. Si todo está sin configurar cae a `http://localhost:3000` (seguro,
  no permisivo).
- **Secretos:** ningún secreto hardcodeado. `.env` está en `.gitignore`;
  `.env.example` solo lleva placeholders. `BETTER_AUTH_SECRET` exige ≥32
  caracteres (validado por Zod en `env.ts`) y el `docker-compose.yml` falla si
  no se proporciona.

## 7. Dependencias

`pnpm audit` reporta **65 vulnerabilidades** (5 bajas, 36 medias, 24 altas).
Son fruto de **versiones desactualizadas**, no de paquetes maliciosos ni
typosquatting — todos los paquetes son oficiales. Relevantes para runtime:

- `next` 16.1.6 → varias advisories `high`; parcheado en **≥16.2.6**.
- `fastify` 5.6.0 → advisory; parcheado en **≥5.8.5**.
- Resto (`hono`, `kysely`, `effect`, `drizzle-orm`, `vite`…) son dependencias
  **transitivas** de la cadena de better-auth y del tooling de build/test.

**Recomendación:** ejecutar `pnpm update next fastify` (y revisar el resto)
antes de exponer públicamente, y añadir `pnpm audit` a un pipeline de CI.

## 8. Observaciones de calidad / higiene

- El `.gitignore` ignora `.agents/`, `.claude/`, `skills/` y un fichero
  `需求说明.md`, pero `.agents/` y `skills/` **sí están versionados** (artefactos
  de tooling de IA añadidos a la fuerza). No es un problema de seguridad, solo
  ruido del repo.
- Sin ESLint/Prettier, sin workflow de CI, sin reporte de cobertura de tests
  (aunque hay una buena batería de tests Vitest + Playwright).

## Estado funcional

Proyecto **completo y funcional** (v1.7), sin TODOs/stubs. Monorepo pnpm:
API Fastify + Prisma + SQLite, web Next.js, paquetes MCP y plugin OpenClaw.
La verificación en runtime (build, tests, arranque del stack) se documenta en
el informe final de la revisión.
