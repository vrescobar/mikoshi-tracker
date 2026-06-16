---
name: mikoshi-tracker-food
description: >
  Registro y consulta de comidas vía MikoshiTracker. Clasifica la entrada del
  usuario (foto de etiqueta, foto de plato, texto libre o valores manuales) y
  aplica el pipeline de confianza por niveles (Tier 0–4): OCR de etiqueta,
  similitud con historial reciente, búsqueda web o estimación visual. Solicita
  confirmación cuando la confianza es insuficiente. Solo actúa con el token
  del emisor; nunca registra en nombre de otro.
metadata:
  mikoshi:
    tags:
      - food
      - nutrition
      - health
      - comida
      - calorías
    tools:
      - name: food_log_from_input
        description: >
          Registra una comida a partir de la entrada del usuario. Acepta texto
          libre, descripción de foto o valores manuales explícitos. Aplica el
          pipeline de niveles de confianza: OCR de etiqueta nutricional (Tier 1,
          confianza ≤ 0.95), similitud con comidas recientes (Tier 2, ≤ 0.90),
          búsqueda web + reconciliación (Tier 3, ≤ 0.70) o estimación visual
          (Tier 4, ≤ 0.55). Si la confianza es alta y la fuente es fiable,
          registra directamente; si no, devuelve una propuesta para que el
          usuario confirme. Para registro con valores ya conocidos usa
          `manual: true`.
        inputSchema:
          type: object
          properties:
            input:
              type: string
              description: "Texto que describe la comida (p.ej. 'comí arroz con pollo', 'foto del plato')"
            attachment_ref:
              type: string
              description: "Handle de la foto adjunta (att_1, att_2…) que el usuario mandó por WhatsApp. Pásalo cuando haya una imagen del plato o la etiqueta: el skill la usa para OCR/visión y la adjunta a la comida. NO intentes poner la imagen en base64; pasa solo el handle."
            image_mime_type:
              type: string
              description: "MIME type de la imagen, p.ej. image/jpeg (opcional; se deduce del adjunto)"
            manual:
              type: boolean
              description: "Si true, registra directamente con los valores proporcionados sin ejecutar el pipeline"
            name:
              type: string
              description: "Nombre del alimento (requerido en modo manual o para confirmar una propuesta)"
            kcal:
              type: number
              description: "Calorías totales (requerido en modo manual)"
            protein_g:
              type: number
              description: "Proteínas en gramos (requerido en modo manual)"
            carbs_g:
              type: number
              description: "Hidratos de carbono en gramos (requerido en modo manual)"
            fat_g:
              type: number
              description: "Grasa total en gramos (requerido en modo manual)"
            fiber_g:
              type: number
              description: "Fibra en gramos (opcional)"
            meal_slot:
              type: string
              enum: ["breakfast", "lunch", "snack", "dinner", "other"]
              description: "Franja horaria de la comida"
            notes:
              type: string
              description: "Notas adicionales sobre la comida"
            occurred_at:
              type: string
              description: "Momento de la comida en formato ISO 8601 (por defecto: ahora)"
        risk: external-write
      - name: food_query_range
        description: >
          Consulta los eventos de comida registrados en un rango de fechas.
          Devuelve la lista de comidas con sus valores nutricionales y los
          totales del período. Úsala cuando alguien pregunte qué comió en un
          período, cuántas calorías lleva hoy o esta semana, o quiera ver su
          historial de comidas.
        inputSchema:
          type: object
          properties:
            from:
              type: string
              description: "Fecha de inicio en formato YYYY-MM-DD (incluida)"
            to:
              type: string
              description: "Fecha de fin en formato YYYY-MM-DD (incluida)"
            limit:
              type: integer
              description: "Número máximo de resultados (por defecto 50)"
          required:
            - from
            - to
        risk: external-read
      - name: food_edit_event
        description: >
          Edita los valores nutricionales de una comida ya registrada. Úsala
          cuando el usuario quiera corregir un registro existente. Proporciona
          el `event_id` y solo los campos que cambiar; los demás permanecen
          intactos. Ejemplo: el usuario dice "en realidad eran 300 kcal, no 200".
          Asegúrate de que el `event_id` es el correcto: si el usuario se refiere
          a la comida de forma vaga ("esa de antes", "la pasta") y hay más de una
          candidata, identifícala primero con food_query_range y, si quedan
          varias plausibles, confirma cuál antes de editar.
        inputSchema:
          type: object
          properties:
            event_id:
              type: string
              description: "ID del evento de comida a editar"
            name:
              type: string
              description: "Nuevo nombre del alimento"
            kcal:
              type: number
              description: "Nuevas calorías"
            protein_g:
              type: number
              description: "Nuevas proteínas en gramos"
            carbs_g:
              type: number
              description: "Nuevos hidratos en gramos"
            fat_g:
              type: number
              description: "Nueva grasa en gramos"
            fiber_g:
              type: number
              description: "Nueva fibra en gramos"
            meal_slot:
              type: string
              enum: ["breakfast", "lunch", "snack", "dinner", "other"]
              description: "Nueva franja horaria"
            notes:
              type: string
              description: "Nuevas notas"
          required:
            - event_id
        risk: external-write
      - name: food_delete_event
        description: >
          Elimina (marca como borrado) un evento de comida. El historial queda
          como auditoría y no se pierde. Úsala cuando el usuario quiera borrar
          un registro erróneo o duplicado. Borra por `event_id` exacto: ante una
          referencia vaga ("borra la última", "esa de antes") con más de una
          candidata, identifica el evento con food_query_range y confirma cuál
          antes de borrar. Borrar el evento equivocado distorsiona el conteo.
        inputSchema:
          type: object
          properties:
            event_id:
              type: string
              description: "ID del evento de comida a eliminar"
          required:
            - event_id
        risk: external-write
    secrets:
      required: []
      optional:
        - mikoshi_tracker_personal_token
        - mikoshi_llm_proxy_url
        - mikoshi_llm_proxy_token
        - brave_search_api_key
        - mikoshi_tracker_api_url
    runner:
      type: subprocess
      command: bun
      args: ["run", "./run.ts"]
      cwd: ./
      inputMode: stdin-json
      outputMode: stdout-json
      timeoutMs: 60000
      network: restricted-egress
      allowedHosts:
        - localhost:7080
        - 127.0.0.1:7777
        - api.search.brave.com
    sampleInput:
      tool: food_query_range
      input:
        from: "2026-05-22"
        to: "2026-05-22"
---

# MikoshiTracker Food — Registro y consulta de comidas

Registra y consulta comidas usando MikoshiTracker como backend de persistencia.
Todo el razonamiento nutricional (clasificación, OCR, similitud, búsqueda web,
visión) ocurre dentro del skill — MikoshiTracker solo valida y persiste la
información que se le envía.

## Cuándo usar cada herramienta

### `food_log_from_input`

Úsala cuando el usuario quiera registrar lo que comió:

- "Comí una manzana." → `{ input: "manzana" }`
- "Aquí la foto de mi etiqueta." → `{ input: "etiqueta de avena", attachment_ref: "att_1" }`
- "Foto del plato de pasta." → `{ input: "pasta carbonara", attachment_ref: "att_1" }`
- "Quiero registrar manualmente: 350 kcal, 20g proteína, 40g carbos, 10g grasa." → `{ manual: true, name: "Comida", kcal: 350, protein_g: 20, carbs_g: 40, fat_g: 10 }`

**Hora: asume "ahora", no preguntes.** Si el usuario no dice cuándo comió, **no
preguntes la hora** — omite `occurred_at` y el registro queda con la hora actual.
Al confirmar el registro, menciona de pasada que puede cambiarla si era otra
("lo apunté como ahora; dime si era otra hora"). Solo usa `occurred_at` cuando el
usuario indique explícitamente otro momento ("esta mañana", "ayer a las 9").
**No** fuerces `meal_slot`: déjalo vacío salvo que el usuario nombre la franja
("para desayunar", "en la cena"); el servidor la deduce de la hora del registro.

**Si el usuario manda una foto del plato o la etiqueta**, pasa su handle en
`attachment_ref` (att_1, att_2…). El skill lee la imagen del adjunto, la usa para
OCR/visión y, además, la **adjunta automáticamente** a la comida para que se vea
en el tracker (la respuesta trae `photo_attached: true`). Tú **nunca** manejas los
bytes de la imagen: solo pasas el handle del adjunto; Mikoshi entrega el fichero
al skill. Si el usuario manda foto pero no texto, pasa igualmente `attachment_ref`
y un `input` breve si lo intuyes ("foto del plato").

**Flujo de confirmación (no pierdas comidas):** Si el skill devuelve
`action: "pending_confirmation"`, presenta la propuesta y espera respuesta. En
cuanto el usuario acepte —"sí", "vale", "ok", un emoji 👍, o valores corregidos—
**llama de nuevo inmediatamente** con `manual: true` y los valores acordados
(name, kcal, protein_g, carbs_g, fat_g, y `meal_slot`/`notes` si los dio). Una
propuesta confirmada que no vuelves a registrar = comida perdida; no la dejes a
medias. Si la respuesta es ambigua, pregunta una vez; si es claramente "no",
descártala.

### `food_query_range`

Úsala cuando el usuario pregunte sobre su historial de comidas:

- "¿Qué comí hoy?" → `{ from: "2026-05-22", to: "2026-05-22" }`
- "Mis comidas de esta semana." → `{ from: "2026-05-17", to: "2026-05-22" }`
- "¿Cuántas calorías llevo hoy?" → consultar y sumar del resultado

### `food_edit_event`

Úsala cuando el usuario quiera corregir un registro:

- "Corrígelo a 400 kcal, me equivoqué." → `{ event_id: "...", kcal: 400 }`
- "El nombre está mal, era pollo al horno." → `{ event_id: "...", name: "Pollo al horno" }`

**Corregir ≠ volver a registrar.** Cuando el usuario corrige una comida que
**acabas de registrar**, edita ese mismo evento con `food_edit_event` usando el
`event_id` que devolvió el `action: "logged"` anterior. **Nunca** vuelvas a
llamar a `food_log_from_input` para una corrección: eso crea un duplicado y
falsea el conteo del día. Si ya hubiera un duplicado, bórralo con
`food_delete_event`.

### `food_delete_event`

Úsala cuando el usuario quiera eliminar un registro:

- "Borra esa última comida, me equivoqué." → `{ event_id: "..." }`

## Reglas de uso

**Desambiguación antes de editar o borrar.** `food_edit_event` y
`food_delete_event` actúan sobre un `event_id` concreto. Cuando el usuario se
refiera a una comida de forma vaga ("borra la última", "esa de antes") y haya
más de una candidata en el día/rango, consulta primero con `food_query_range`
e identifica el evento exacto; si quedan varias plausibles, confirma cuál antes
de tocar nada. El borrado es reversible en auditoría pero falsea el conteo del
día hasta que se note el error.

**El registro solo ocurre vía estas herramientas.** No inventes valores
nutricionales; no uses la memoria como sustituto del registro.

**Identidad del emisor.** Cada operación actúa exclusivamente sobre los datos
del emisor. El token personal lo resuelve el runtime; nunca asumas ni preguntes
quién es.

**Confirmación obligatoria cuando el skill lo solicita.** Si el skill devuelve
`action: "pending_confirmation"`, siempre muestra la propuesta al usuario y
espera su respuesta antes de registrar. Nunca registres sin confirmación si el
skill la requiere.

**Si el emisor no tiene token de MikoshiTracker**, el skill devuelve
`status: "failed", error: "needs-enrolment"`. Informa que puede responder
"quiero conectar mi cuenta de MikoshiTracker" para iniciar el proceso de alta.
