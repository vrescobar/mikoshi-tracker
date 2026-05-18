# Plan — Círculos de hábitos (componente social multiusuario)

> Plan de implementación **para el repositorio Haaabit**. La parte de Mikoshi
> (la skill puente y el cableado del bot de WhatsApp) está en
> `~/projects/mikoshi/PLAN-HAAABIT-CIRCLE.md`. **Este plan se implementa primero**:
> la API de círculos debe existir antes de que la skill de Mikoshi pueda consumirla.

## 1. Contexto y objetivo

Haaabit es hoy estrictamente **monousuario**: un `ApiToken` (hash SHA-256, formato
`haaabit_<hex>`) = exactamente un `User`; la API filtra todo por `userId`
(`requireAuthenticatedUser` en `apps/api/src/auth/session.ts`). No existe ningún
concepto de compartir, visibilidad, grupos, leaderboard ni acceso de terceros.

Queremos un **concurso de hábitos**: varias personas, cada una con su cuenta
Haaabit, forman un grupo; el grupo tiene un leaderboard; y un agente externo (el
bot de WhatsApp de Mikoshi) puede **leer y registrar check-ins** sobre los
hábitos que cada miembro decida compartir en el grupo — pero **nunca** sobre lo
que un miembro no comparte, y **nunca** sobre la cuenta de otro.

Decisiones de diseño que gobiernan todo el plan:

- **El nombre del concepto es `Circle`** (círculo), para no colisionar con el
  "grupo" de WhatsApp ni con futuras agrupaciones internas.
- **La autoridad de autorización vive en Haaabit, validada en servidor.** El bot
  recibe un token de alcance estrecho; no se confía en que el bot (ni el LLM que
  lo controla) se autolimite. Si el bot pide algo fuera de alcance, la API
  responde 403/404. Esta es la propiedad de seguridad central del plan.
- **El token de círculo NO es un token de admin global.** No existe ni existirá
  un token "lee-todo-Haaabit". El token de círculo está acotado a *un* círculo y
  *solo* a los hábitos compartidos en él, y *solo* a escribir check-ins. Si se
  filtra, el radio de daño es un círculo, no la instancia entera.
- **Compartir un hábito en un círculo es un acto de consentimiento del dueño**,
  hecho con su propia sesión. El dueño del círculo no puede meter mano en los
  hábitos de otro miembro. (Para la prueba inicial se puede ignorar el matiz de
  privacidad ejecutando "compartir todo", pero el *mecanismo* sigue siendo
  consentido: cada miembro comparte lo suyo.)
- **El feature NO pasa por el paquete `@haaabit/mcp`.** Ese paquete sigue siendo
  el puente monousuario por token personal. Los círculos son una **superficie
  REST nueva** (`/api/circles/...`) que la skill de Mikoshi consume directamente
  vía `fetch`, igual que la skill `brave-search` llama a Brave directamente.

## 2. Modelo de datos (`prisma/schema.prisma`)

Cuatro modelos nuevos. SQLite vía Prisma (generador con `output` a
`apps/api/src/generated/prisma`).

```prisma
model Circle {
  id          String             @id @default(cuid())
  name        String
  ownerId     String
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  owner       User               @relation("CircleOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  memberships CircleMembership[]
  habitShares CircleHabitShare[]
  tokens      CircleToken[]
}

model CircleMembership {
  id         String   @id @default(cuid())
  circleId   String
  userId     String
  role       String   @default("member")   // "owner" | "member"
  externalId String?                        // id de integración OPACO (p.ej. identityId de Mikoshi)
  joinedAt   DateTime @default(now())
  circle     Circle   @relation(fields: [circleId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([circleId, userId])
  @@unique([circleId, externalId])          // SQLite permite múltiples NULL; un externalId no nulo es único por círculo
  @@index([externalId])
}

model CircleHabitShare {
  id        String   @id @default(cuid())
  circleId  String
  habitId   String
  createdAt DateTime @default(now())
  circle    Circle   @relation(fields: [circleId], references: [id], onDelete: Cascade)
  habit     Habit    @relation(fields: [habitId], references: [id], onDelete: Cascade)

  @@unique([circleId, habitId])
  @@index([habitId])
}

model CircleToken {
  id        String   @id @default(cuid())
  circleId  String
  token     String   @unique                // hash SHA-256, igual que ApiToken
  label     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  circle    Circle   @relation(fields: [circleId], references: [id], onDelete: Cascade)

  @@index([circleId])
}
```

Relaciones inversas a añadir en los modelos existentes:

- `User`: `circlesOwned CircleMembership[]` no — usar dos relaciones nombradas:
  `circlesOwned Circle[] @relation("CircleOwner")` y
  `circleMemberships CircleMembership[]`.
- `Habit`: `circleShares CircleHabitShare[]`.

Notas de diseño del esquema:

- **`externalId` es deliberadamente opaco.** Haaabit guarda una cadena por
  membresía y *no sabe que es un JID de WhatsApp ni un identityId de Mikoshi*.
  Así el componente social no se acopla a WhatsApp y sirve mañana para otras
  integraciones (Telegram, Discord, etc.). La resolución JID→cuenta ocurre en la
  skill de Mikoshi, no aquí.
- **`CircleHabitShare` es el opt-in de privacidad.** Un hábito solo es visible y
  modificable por el círculo si tiene fila en esta tabla. Para la prueba inicial
  se rellena en bloque; para el producto, cada miembro elige. El esquema soporta
  ambos casos sin cambios.
- **El alcance del `CircleToken` no se modela como columna**: es una propiedad
  *del código* (la capa de auth y el servicio de círculos solo exponen lectura
  de hábitos compartidos + escritura de check-ins). No hay endpoint accesible por
  `CircleToken` que cree/edite/archive hábitos ni que toque cuentas.

### Migración

```
pnpm prisma migrate dev --name add_circles
```

Regenera el cliente Prisma (`apps/api/src/generated/prisma`). Verificar que el
build de `apps/api` sigue verde tras regenerar.

## 3. Token de círculo — `apps/api/src/auth/circle-token.ts`

Espejo de `api-token.ts`. Funciones:

- `generateCircleToken()` → `haaabit_circle_${randomBytes(24).toString("hex")}`.
- `hashCircleToken(token)` → `createHash("sha256")...` (idéntico patrón).
- `createCircleToken(db, circleId, label?)` → genera, hashea, inserta `CircleToken`;
  devuelve `{ token, tokenId, createdAt }`. El token plano se devuelve **una sola
  vez**, como `resetPersonalApiToken`.
- `findCircleByToken(db, token)` → busca `CircleToken` por hash, incluye `circle`;
  devuelve `{ circle, tokenId } | null`.
- `listCircleTokens(db, circleId)` → metadatos (sin el token), para la UI.
- `revokeCircleToken(db, tokenId)` → borra la fila.

El prefijo `haaabit_circle_` distingue visualmente un token de círculo de uno
personal y evita confusiones al pegarlos.

## 4. Autenticación de círculo — `apps/api/src/auth/circle-session.ts`

Ruta de auth **distinta** de `requireAuthenticatedUser`. El token de círculo
autentica un **círculo**, no un usuario.

```ts
export class CircleAuthError extends Error {
  constructor(public readonly statusCode: 401 | 403 | 404, message: string) { ... }
}

export interface CircleContext {
  circle: { id: string; name: string; ownerId: string };
  tokenId: string;
}

// Extrae el Bearer, resuelve findCircleByToken, y EXIGE que el círculo del token
// coincida con el :circleId de la ruta. Cualquier desajuste => 403.
export async function requireCircleContext(
  request: FastifyRequest,
  pathCircleId: string,
): Promise<CircleContext>;
```

Reglas:

- Sin Bearer → 401.
- Token desconocido → 401.
- Token válido pero `circle.id !== pathCircleId` → **403** (un token de círculo
  solo opera sobre su propio círculo; no puede direccionar otro por la URL).

Este fichero es **la frontera de autoridad**. Toda ruta `/api/circles/:circleId/*`
autenticada por token de círculo pasa por aquí primero.

## 5. Módulo de círculos — `apps/api/src/modules/circles/`

Sigue el patrón existente del repo (`habits/`, `today/`, `stats/`):

- `circle.schema.ts` — esquemas Zod de entrada/salida.
- `circle.repository.ts` — consultas Prisma puras.
- `circle.service.ts` — lógica de negocio **y la verificación de autorización**.
- `circle.controller.ts` — handlers Fastify.
- `circle.routes.ts` — registro de rutas + `circleApiRouteDefinitions` (OpenAPI).

Además, esquemas compartidos en `packages/contracts/src/circles.ts` (coherente
con `habits.ts`, `today.ts`, etc.) — los consumen la API y la web.

### 5.1 Endpoints autenticados por **token de círculo**

Todos cuelgan de `/api/circles/:circleId` y empiezan llamando a
`requireCircleContext(request, circleId)`.

| Método | Ruta | Tipo | Descripción |
|---|---|---|---|
| `GET`  | `/api/circles/:circleId/members` | read | Lista `{ userId, displayName, role, externalId }` de cada miembro. |
| `GET`  | `/api/circles/:circleId/leaderboard` | read | Stats agregadas por miembro **solo sobre hábitos compartidos** (completados hoy, racha, tasa semanal). |
| `GET`  | `/api/circles/:circleId/members/:userId/habits` | read | Hábitos **compartidos** de ese miembro + su estado de hoy. |
| `POST` | `/api/circles/:circleId/members/:userId/habits/:habitId/complete` | write | Check-in booleano. |
| `POST` | `/api/circles/:circleId/members/:userId/habits/:habitId/set-total` | write | Check-in cuantitativo (`{ total }`). |
| `POST` | `/api/circles/:circleId/members/:userId/habits/:habitId/undo` | write | Deshace la última mutación de hoy **con `source: "circle"`** de ese hábito. Nunca deshace un check-in `web`/`ai` del propio usuario (ver §5.2bis). |

### 5.2 La verificación de autorización (núcleo de seguridad)

`circle.service.ts` expone una función única `assertCircleHabitWritable` que
**toda** ruta de escritura ejecuta antes de mutar nada:

```
dado (circleId del token, userId de la ruta, habitId de la ruta):
  1. userId DEBE tener CircleMembership en circleId        → si no, 404 "member not in circle"
  2. habitId DEBE pertenecer a userId (Habit.userId)        → si no, 404 "habit not found"
  3. habitId DEBE estar activo (isActive)                   → si no, 409 HABIT_INACTIVE
  4. (circleId, habitId) DEBE existir en CircleHabitShare   → si no, 403 "habit not shared in this circle"
```

Para lectura (`/members/:userId/habits`), se aplica 1 y se filtra por
`CircleHabitShare`; un hábito no compartido **nunca** aparece en la respuesta.

Tras pasar la verificación, la escritura **reutiliza el servicio de check-ins
existente** (`apps/api/src/modules/checkins/checkin.service.ts`) pasándole el
`userId` ya resuelto y autorizado. No se duplica la lógica de mutación ni la de
`HabitDayState`/`CheckInMutation`. El `circle.service` es solo la capa de
autorización + delegación.

### 5.2bis Alcance del `undo` por token de círculo

Un token de círculo **no puede deshacer mutaciones que no creó él**. La ruta
`undo` resuelve la última mutación del día para `(userId, habitId)` y **exige
que su `source` sea `"circle"`**; si la última mutación es `web` o `ai`,
responde `409` (`UNDO_NOT_CIRCLE_SOURCED`) sin tocar nada. Esto impide que el
bot revierte un check-in legítimo que el usuario hizo a mano desde la web. El
`undo` de la web (token personal) conserva su comportamiento actual sin cambios.

### 5.3 `CheckInMutation.source`

Las escrituras de círculo deben registrarse con `source: "circle"` (hoy el MCP
usa `"ai"`; la web usa `"web"`). Revisar `checkins/checkin.schema.ts` y
`packages/contracts/src/checkins.ts`: si `source` está enumerado, añadir
`"circle"`. Esto deja auditable en `CheckInMutation` qué check-ins entraron por
el bot del concurso frente a los manuales del usuario.

### 5.4 Endpoints autenticados por **sesión de usuario** (gestión)

Para que un usuario cree y gobierne círculos desde la web. Usan
`requireSession` / `requireAuthenticatedUser` como el resto de la app.

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST`  | `/api/circles` | sesión | Crea un círculo. El creador queda `owner` y primera `CircleMembership` con `role: "owner"`. |
| `GET`   | `/api/circles` | sesión | Lista los círculos donde el usuario es miembro. |
| `GET`   | `/api/circles/:circleId` | sesión (miembro) | Detalle del círculo: miembros, hábitos compartidos del propio usuario. |
| `POST`  | `/api/circles/:circleId/members` | sesión (owner) | Añade un miembro **por email**. (Atajo de prueba; ver §5.5 para el flujo de invitación real.) |
| `PATCH` | `/api/circles/:circleId/members/:membershipId` | sesión (owner) | Edita `role` y `externalId` de una membresía. |
| `DELETE`| `/api/circles/:circleId/members/:membershipId` | sesión (owner) | Expulsa a un miembro. |
| `POST`  | `/api/circles/:circleId/shares` | sesión (miembro) | El miembro comparte **un hábito propio** (`{ habitId }`) en el círculo. Verifica `Habit.userId === session.user.id`. |
| `DELETE`| `/api/circles/:circleId/shares/:habitId` | sesión (miembro) | Deja de compartir un hábito propio. |
| `POST`  | `/api/circles/:circleId/tokens` | sesión (owner) | Acuña un `CircleToken`. Devuelve el token plano **una sola vez**. |
| `GET`   | `/api/circles/:circleId/tokens` | sesión (owner) | Lista metadatos de tokens (sin el valor). |
| `DELETE`| `/api/circles/:circleId/tokens/:tokenId` | sesión (owner) | Revoca un token. |

Regla de oro: **un usuario solo puede compartir hábitos que le pertenecen.** El
owner del círculo gobierna membresías y tokens, pero **no** puede compartir
hábitos ajenos ni leerlos fuera del leaderboard agregado.

### 5.5 Flujo de incorporación de miembros (consentimiento)

- **Diseño correcto (producto):** el owner crea una *invitación*; el invitado la
  acepta desde su sesión, lo que crea la `CircleMembership`. Esto garantiza
  consentimiento.
- **Atajo para la prueba:** `POST /api/circles/:circleId/members` con un email
  ya existente crea la membresía directamente (solo owner). Aceptable porque en
  la prueba Víctor y Ana se coordinan fuera de banda.
- Implementar el atajo en la Fase 1; la invitación formal queda como Fase 4
  (opcional, no bloquea la prueba).

## 6. OpenAPI

- Añadir `circleApiRouteDefinitions: PublicApiRouteDefinition[]` en
  `circle.routes.ts` y agregarlas a `publicApiRouteDefinitions` en
  `apps/api/src/plugins/openapi.ts`.
- Añadir un esquema de seguridad `CircleBearerAuth` (o reutilizar `BearerAuth`
  con descripción ampliada: "token personal **o** token de círculo").
- Documentar en la página `/api/docs` la sección "Circles".

## 7. Web (`apps/web`)

La sección "Circles" es una **parte de pleno derecho de la app**, no un añadido
diferible: mismo lenguaje visual que auth/dashboard/habits según `CLAUDE.md`
(light-mode, calma, jerarquía tipográfica, CSS Modules, diálogos Radix),
reutilizando los primitivos de `components/ui/`. No se ejercita "vía curl": la
GUI se entrega completa, con estados vacío/carga/error, responsive e i18n.

Pantallas:

1. **Lista de círculos** + flujo "Crear círculo" (diálogo Radix), con estado
   vacío.
2. **Detalle de círculo**: miembros, leaderboard, y —para el propio usuario— la
   lista de sus hábitos con un toggle "compartir en este círculo".
3. **Gestión (solo owner)**: añadir/expulsar miembros, editar `externalId`,
   acuñar/revocar tokens de círculo (mostrar el token plano una vez, con aviso).

### 7.1 La GUI debe ser explicativa

Haaabit es self-hosted: el usuario es su propio administrador y necesita
entender qué concede cada acción. **Toda opción que comparte datos o concede
acceso lleva texto en lenguaje llano que explica qué hace y sus consecuencias**,
visible antes de actuar (no escondido en un tooltip). Como mínimo:

- **Compartir un hábito** — explicar que el círculo —y cualquier bot con token
  de círculo— podrá ver ese hábito y registrar check-ins en él.
- **Acuñar un token de círculo** — explicar que es una credencial que permite
  leer los hábitos compartidos y escribir check-ins de *todo* el círculo, que
  se muestra una sola vez, y cómo revocarla.
- **Editar `externalId`** — explicar que vincula a ese miembro con una identidad
  externa (p.ej. WhatsApp) y que un valor erróneo emparejaría al miembro
  equivocado.
- **Expulsar un miembro / dejar de compartir** — explicar qué deja de ser
  visible y que el historial no se borra.

### 7.2 Internacionalización

La GUI de Haaabit es hoy bilingüe (inglés / chino). Como parte de este trabajo
se añade una **traducción al español (`es`)** de **toda la GUI** —todas las
pantallas existentes (auth, dashboard, habits, detalle, api-access) más la
nueva sección Circles—, dejando la app trilingüe `en` / `zh` / `es` con
detección por idioma del navegador. Esto incluye el texto explicativo de §7.1.

## 8. Fases de implementación

| Fase | Contenido | Bloquea la prueba |
|---|---|---|
| **H1 — Datos** | Modelos Prisma + migración + regenerar cliente. | Sí |
| **H2 — Contracts** | `packages/contracts/src/circles.ts` (esquemas Zod + tipos de toda la superficie). Se escribe **antes** de la API para que handlers y web importen una sola definición. | Sí |
| **H3 — Auth** | `circle-token.ts` + `circle-session.ts`. | Sí |
| **H4 — API círculo-token** | Módulo `circles/`: members, leaderboard, habits, complete/set-total/undo + `assertCircleHabitWritable`. Reutiliza `checkin.service`. | Sí |
| **H5 — API gestión** | Endpoints de sesión: crear círculo, miembros, shares, tokens. | Sí (se necesita para crear el círculo de prueba) |
| **H6 — Tests del núcleo** | Vitest: matriz de denegación, ver §9. | No (pero exigido para cerrar) |
| **H7 — OpenAPI** | Route definitions + esquema de seguridad + `/api/docs`. | No (recomendado) |
| **H8 — Web** | Sección Circles completa: GUI consistente y **explicativa** (§7.1), estados vacío/carga/error, responsive. | Sí (la GUI es entregable) |
| **H9 — i18n español** | Traducción `es` de **toda** la GUI (§7.2). | No (exigido para cerrar) |
| **H10 — Verificación** | Pase de aceptación completo, ver §10. | No (cierra el trabajo) |

Orden de ejecución: H1 → H2 → H3 → H4 → H5 → H6 → H7 → H8 → H9 → H10.

## 9. Tests (Vitest, `apps/api`)

El test central es la **matriz de denegación** del token de círculo —
demuestra que la seguridad no depende de buena conducta del cliente:

1. Token de círculo A intentando operar sobre `:circleId` de B → **403**.
2. Escritura sobre `userId` que **no es miembro** del círculo → **404**.
3. Escritura sobre `habitId` que existe pero **no pertenece** a ese `userId` → **404**.
4. Escritura sobre un hábito del miembro **no compartido** en el círculo → **403**.
5. Escritura sobre hábito **archivado** → **409 HABIT_INACTIVE**.
6. Camino feliz: miembro + hábito compartido → check-in OK, aparece
   `CheckInMutation` con `source: "circle"`, y el leaderboard lo refleja.
7. `GET /members/:userId/habits` **nunca** incluye un hábito no compartido.
8. Gestión: un usuario no-owner recibe 403 al acuñar token o añadir miembro;
   un miembro no puede compartir un hábito que no es suyo (403/404).
9. `undo` por token de círculo cuando la última mutación del día es `web`/`ai`
   → **409 `UNDO_NOT_CIRCLE_SOURCED`**, y la mutación del usuario queda intacta;
   cuando la última es `source: "circle"`, el `undo` funciona (§5.2bis).

Cobertura adicional: `circle-token` hash/lookup; `requireCircleContext` con
token ausente/desconocido/cruzado.

## 10. Criterios de aceptación

- `pnpm --filter @haaabit/api test` verde, incluida la matriz §9.
- `pnpm -r build` / typecheck verdes tras regenerar Prisma.
- `pnpm -r lint` verde.
- Un círculo creado con Víctor (owner) y Ana (member), cada uno con hábitos
  compartidos, expone un leaderboard correcto vía token de círculo.
- Con el token de círculo, un `POST .../members/:userId/habits/:habitId/complete`
  sobre un hábito compartido funciona; sobre uno no compartido devuelve 403.
- `/api/docs` documenta la superficie de círculos.
- La sección Circles de la web está completa: estados vacío/carga/error,
  responsive, y cada acción que comparte datos o concede acceso lleva texto
  explicativo de sus consecuencias (§7.1).
- Toda la GUI (pantallas existentes + Circles) está traducida al español; la
  app funciona en `en` / `zh` / `es` sin cadenas sin traducir (§7.2).
- El paquete `@haaabit/mcp` y el flujo monousuario por token personal **siguen
  intactos** (sin regresiones en sus tests).

## 11. Riesgos y decisiones abiertas

- **Escritura vía token de círculo es una concesión de autoridad real.** Se
  acota a *check-ins* (`complete`/`set-total`/`undo`) sobre hábitos compartidos;
  el token **no** puede crear/editar/archivar hábitos ni tocar la cuenta. Esa
  línea mantiene el radio de daño pequeño. No ampliar el alcance del token sin
  revisar este plan.
- **`externalId` lo fija el owner** (vía `PATCH membership`). Si lo pone mal, un
  miembro de WhatsApp podría quedar emparejado con la cuenta equivocada. Mitigar
  en el futuro con un flujo de auto-vinculación: el invitado confirma su
  `externalId` desde su propia sesión. Para la prueba, Víctor lo configura con
  cuidado y se valida con un check-in de prueba.
- **Privacidad por hábito** (mostrar unos sí y otros no) ya está soportada por
  `CircleHabitShare`; en la prueba se "comparte todo", pero no hay que diseñar
  nada más para activarla después.
- **Tokens con alcance aún más fino** (solo-lectura, o de un solo hábito) son
  una evolución futura: hoy `CircleToken` = lectura de compartidos + escritura
  de check-ins. Si se necesitara, añadir una columna `scope` al modelo.
- **Rate limiting**: los endpoints de círculo caen bajo el límite global
  existente (`security.ts`). Suficiente para la prueba; revisar si se abre a
  más círculos.
