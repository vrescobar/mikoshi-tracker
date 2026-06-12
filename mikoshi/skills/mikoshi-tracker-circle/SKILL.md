---
name: mikoshi-tracker-circle
description: >
  Concurso de hábitos en grupo vía MikoshiTracker. Cada escritura usa el token
  personal del emisor (resuelto per-user); el leaderboard usa el token de
  círculo compartido (solo lectura).
metadata:
  mikoshi:
    tags:
      - habits
      - social
      - productivity
    tools:
      - name: circle_join
        description: >
          Comparte un hábito propio en el círculo del grupo. Úsala cuando
          alguien quiera sumarse al reto aportando un hábito de su cuenta de
          MikoshiTracker. En `habit` pasa las PALABRAS DISTINTIVAS del hábito
          (p.ej. "despertador", "meditación", "agua"), no la frase entera del
          usuario palabra por palabra: el matcher resuelve por contexto y
          tolera paráfrasis y sinónimos. Si la frase es indirecta o ambigua,
          rellena `context` con lo que dijo el usuario. Comparte el hábito VIVO
          y bien formulado, no un borrador, un casi-duplicado ni uno archivado.
        inputSchema:
          type: object
          properties:
            habit:
              type: string
              description: "Palabras distintivas del hábito personal a compartir (no la frase entera del usuario)"
            context:
              type: string
              description: "Opcional: frase literal del usuario o pista de a qué hábito se refiere, para desambiguar paráfrasis o lenguaje indirecto"
          required:
            - habit
        risk: external-write
      - name: circle_report
        description: >
          Registra un check-in de hábito en el círculo. Marca el hábito como
          COMPLETADO por defecto (basta con que el usuario diga "ya lo hice",
          "hecho", "done"): no necesitas `value` salvo para hábitos de cantidad;
          usa `undo: true` para revertir el último registro. En `habit` pasa las
          PALABRAS DISTINTIVAS del hábito, no la frase entera; el matcher resuelve
          por contexto y tolera paráfrasis. Si la frase es indirecta o ambigua,
          rellena `context`.
          CORRECCIONES: si el usuario dice que hizo algo en un día PASADO ("el
          lunes hice mi entreno pero no lo marqué", "ayer", "hace 2 días"),
          convierte tú ese día a una fecha concreta `YYYY-MM-DD` y pásala en
          `date` (máx. 14 días atrás, nunca futuro). Por defecto se registra para
          el EMISOR; sólo el owner del círculo puede usar `member` para corregir a
          OTRA persona (por nombre o por el userId del leaderboard).
        inputSchema:
          type: object
          properties:
            habit:
              type: string
              description: "Palabras distintivas del hábito a registrar (no la frase entera del usuario)"
            value:
              type: number
              description: "Valor numérico para hábitos de cantidad (ej. 3 vasos de agua)"
            undo:
              type: boolean
              description: "Si true, revierte el último check-in del hábito"
            date:
              type: string
              description: "Opcional: fecha del check-in en formato YYYY-MM-DD para corregir un día pasado (máx. 14 días atrás, nunca futuro). Tú resuelves 'el lunes'/'ayer' a la fecha concreta."
            member:
              type: string
              description: "Opcional y SOLO para el owner: nombre o userId del miembro al que corregir (si no es el propio emisor)"
            context:
              type: string
              description: "Opcional: frase literal del usuario o pista de a qué hábito se refiere, para desambiguar paráfrasis o lenguaje indirecto"
          required:
            - habit
        risk: external-write
      - name: circle_member_rename
        description: >
          Cambia el nombre con el que aparece un miembro del círculo en el
          ranking. SOLO el owner del círculo puede usarla. Úsala cuando alguien
          salga con un identificador feo (un UUID) o con un nombre incorrecto y
          el owner pida corregirlo (p.ej. "el que sale como 750b55… es Dani,
          ponle el nombre"). En `member` pasa el nombre actual o el userId que
          muestra el leaderboard; en `name`, el nombre nuevo.
        inputSchema:
          type: object
          properties:
            member:
              type: string
              description: "Nombre actual o userId (del leaderboard) del miembro a renombrar"
            name:
              type: string
              description: "Nombre nuevo a mostrar (1–60 caracteres)"
          required:
            - member
            - name
        risk: external-write
      - name: circle_undo
        description: >
          Deshace el último check-in del emisor en el círculo. Si se especifica
          `habit`, deshace el registro de ese hábito concreto; sin `habit`,
          deshace el check-in más reciente del emisor en el círculo. Usa la
          forma sin `habit` solo cuando el usuario se refiera claramente "a lo
          último"; si menciona un hábito concreto, pásalo (palabras distintivas)
          y, si la frase es indirecta o ambigua, rellena `context`.
        inputSchema:
          type: object
          properties:
            habit:
              type: string
              description: "Palabras distintivas del hábito cuyo último registro deshacer (opcional)"
            context:
              type: string
              description: "Opcional: frase literal del usuario o pista de a qué hábito se refiere, para desambiguar paráfrasis o lenguaje indirecto"
        risk: external-write
      - name: circle_leaderboard
        description: >
          Devuelve el ranking actualizado del círculo: posición, nombre y
          puntuación de cada miembro. Úsala cuando alguien pregunte "¿cómo
          vamos?", "¿quién va primero?" o quiera ver la tabla del grupo.
        inputSchema: {}
        risk: external-read
      - name: circle_card
        description: >
          Genera el marcador del círculo como IMAGEN (ranking con pancetas). El
          runtime la publica como mensaje aparte; te devuelve las posiciones en
          `summary` para tu comentario. (El parte semanal automático ya pone su
          propia card fijada; usa esta para mandar el ranking on-demand.)
        inputSchema: {}
        risk: external-read
      - name: circle_donut
        description: >
          Genera el DONUT de progreso del grupo como IMAGEN (sesiones hechas vs
          objetivo total, cumplidores, pancetas, nivel). Úsala cuando pregunten
          "¿cómo va el grupo?". Devuelve `summary` para tu comentario.
        inputSchema: {}
        risk: external-read
    secrets:
      required:
        - mikoshi_tracker_circle_token
        - mikoshi_tracker_circle_id
        - mikoshi_tracker_circle_api_url
      optional:
        - mikoshi_tracker_personal_token
        - mikoshi_tracker_admin_key
        - mikoshi_llm_proxy_url
        - mikoshi_llm_proxy_token
    runner:
      type: subprocess
      command: bun
      args: ["run", "./run.ts"]
      cwd: ./
      inputMode: stdin-json
      outputMode: stdout-json
      timeoutMs: 30000
      network: restricted-egress
      allowedHosts:
        - localhost:7080
        - 127.0.0.1:7777
    sampleInput:
      tool: circle_leaderboard
      input: {}
---

# MikoshiTracker Circle

Accede al concurso de hábitos del grupo vía MikoshiTracker. Cada escritura se
autentifica con el token personal del emisor — nunca actúa en nombre de otro.
El leaderboard usa el token de círculo compartido (solo lectura).

## Cuándo usar cada herramienta

### `circle_join`

Úsala cuando alguien quiera unirse al concurso compartiendo uno de sus hábitos
personales de MikoshiTracker. Pasa las **palabras distintivas**, no la frase
entera:

- "Quiero sumar mi hábito de meditación al reto." → `{ habit: "meditación" }`
- "Añade mi lectura diaria al círculo." → `{ habit: "lectura" }`
- "Comparto mi hábito de despertarme cuando suena el despertador" →
  `{ habit: "despertador", context: "despertarme cuando suena el despertador" }`
  (aunque el hábito esté registrado como "Levantarme cuando suena el despertador",
  el matcher lo resuelve por contexto)

### `circle_report`

Úsala para registrar el progreso del emisor:

- "Ya medité." → `{ habit: "meditación" }` (marca como completado)
- "Bebí 3 vasos de agua." → `{ habit: "agua", value: 3 }` (valor numérico)
- "Deshaz mi registro de ejercicio de hoy." → `{ habit: "ejercicio", undo: true }`

**Correcciones de días pasados.** Si el usuario dice que hizo algo otro día y no
lo marcó, resuelve tú la fecha a `YYYY-MM-DD` y pásala en `date` (máx. 14 días
atrás, nunca futuro):

- "El lunes hice mi entreno pero no lo marqué." (y hoy es miércoles 2026-06-03)
  → `{ habit: "entreno", date: "2026-06-01" }`
- "Ayer bebí mis 2 litros." → `{ habit: "agua", value: 2, date: "2026-06-02" }`

**Corregir a otra persona (solo el owner).** Si el owner del círculo pide
corregir a otro miembro, añade `member` (nombre o el userId del leaderboard). Si
quien lo pide no es el owner, la herramienta lo rechaza:

- "Márcale a Mariano su carrera del sábado." → `{ habit: "7 km", member: "Mariano", date: "2026-05-31" }`

### `circle_member_rename`

Úsala cuando el **owner** quiera corregir el nombre con el que un miembro aparece
en el ranking (típico: alguien sale como un UUID):

- "El que sale como 750b55… es Dani, ponle el nombre." →
  `{ member: "750b55db-c536-4338-a241-120d1adbca63", name: "Dani" }`
- "Mariano aparece mal escrito, es 'Mariano'." → `{ member: "mariano", name: "Mariano" }`

Si quien lo pide no es el owner del círculo, la herramienta lo rechaza con un
mensaje claro.

### `circle_undo`

Úsala para deshacer el último registro sin necesitar el nombre del hábito:

- "Me equivoqué, deshaz lo último." → sin argumentos
- "Deshaz mi meditación de hoy." → `{ habit: "meditación" }`

### `circle_leaderboard`

Úsala cuando alguien quiera ver el ranking del grupo:

- "¿Cómo vamos en el círculo?"
- "¿Quién va primero?"
- "Muéstrame la tabla."

Devuelve `{ leaderboard: [...] }`. Cada fila trae, por miembro:

- `displayName` — nombre a mostrar.
- `completedTodayCount` — hábitos marcados hoy.
- `sharedHabitCount` — hábitos que tiene en el círculo.
- `currentStreak` — racha de días seguidos con al menos un check-in.
- `weeklyCompletionRate` — adherencia de la semana en **fracción 0–1 respecto a
  la meta de cada hábito** (un hábito de 4×/semana cuenta sobre 4, no sobre 7).
  Multiplícalo por 100 para el porcentaje.
- `weeklyCompletedCount` / `weeklyTargetCount` — numerador/denominador crudos
  detrás del porcentaje, sumados sobre los hábitos del miembro. Úsalos para
  enseñar un honesto **"X/Y → Z%"** sin inventarte cifras: p.ej. `3/4 → 75%`.

**No recalcules el porcentaje a mano dividiendo por 7 ni por los días de la
semana.** El backend ya divide por la meta semanal real de cada hábito; usa
`weeklyCompletionRate` (×100) o `weeklyCompletedCount/weeklyTargetCount` tal cual.

## Reglas de uso

**Matching contextual del hábito.** `circle_join`, `circle_report` y
`circle_undo` resuelven el hábito con un matcher que tolera paráfrasis,
sinónimos, reordenación de palabras y lenguaje indirecto (apoyado en un LLM
cuando el nombre no coincide literal). Para que acierte: pasa en `habit` las
**palabras distintivas** del hábito (no la frase entera del usuario) y, si la
petición es indirecta o ambigua, añade `context` con lo que dijo el usuario. Si
aun así sigue siendo genuinamente ambiguo entre varios hábitos vivos, confirma
de cuál se trata antes de escribir:

- `circle_join` mete UN hábito personal en el reto. Comparte el hábito **vivo y
  bien formulado**, nunca un borrador ni un duplicado archivado. Si el usuario
  reformuló su hábito (uno nuevo mejor redactado sustituye a otro), comparte el
  que de verdad usa y, si el viejo estaba en el círculo, recuérdale que conviene
  retirarlo para no duplicar.
- `circle_report` puntúa para el reto: compartir o marcar el hábito equivocado
  falsea el leaderboard. Ante la duda, pregunta.
- `circle_undo` sin `habit` borra el último check-in: úsalo solo para "lo
  último"; con hábito concreto, pásalo explícito.

**El seguimiento de hábitos solo ocurre vía estas herramientas.** No inventes
registros, no uses la memoria como tracker de hábitos.

**Todo reporte de progreso pasa por la tool ANTES de reconocerlo — nunca
celebres un registro que no ha ocurrido.** Cuando alguien diga "lo hice",
"hecho", "completé el entreno", etc., llama a `circle_report` (o, si es su
hábito personal, `today_complete`/`today_set_total` del skill `mikoshi-tracker`)
y **ajusta tu respuesta al resultado de la tool**, no a lo que dijo el humano:
- Si la tool devuelve **éxito**, confírmalo (usa su `summary`: "hecho, hoy llevas
  3/5").
- Si **falla** (no es miembro del círculo, no está enrolado, no tiene ese
  hábito), NO digas "perfecto" ni des por bueno el check-in: relata el fallo en
  tu voz y ofrece el siguiente paso (apuntarse al reto, conectar su cuenta,
  compartir el hábito con `circle_join`, o pedir al owner que lo añada).
Un "perfecto" suelto que da a entender que quedó registrado, cuando no llamaste
a la tool o la tool falló, es mentir sobre lo que hiciste.

**Quien reporta puede no estar en el reto.** En un grupo, cualquiera puede
escribir "hice un entreno" aunque no esté en el círculo ni tenga hábito propio.
No asumas que pertenece: el resultado de `circle_report` es la fuente de verdad.
Si no es miembro, díselo con claridad (no cuenta para el ranking) y ofrécele
unirse o conectar su cuenta; no le hagas creer que sumó puntos.

**El check-in siempre se aplica a quien escribe.** La identidad del emisor
se resuelve desde el contexto de WhatsApp; nunca asumas ni preguntes quién es.

**Si el emisor no tiene token personal de MikoshiTracker**, la herramienta devolverá
un error de enrolamiento. En ese caso, informa que puede responder
"quiero conectar mi cuenta de MikoshiTracker" para iniciar el proceso de alta.

**Cuando una herramienta falle, traduce el error a lenguaje natural.** Nunca
muestres códigos HTTP (404, 403…), nombres de endpoint ni jerga técnica del
sistema. El campo `error` ya viene redactado en lenguaje claro y accionable:
reformúlalo en tu propia voz y, si procede, ofrece el siguiente paso concreto
(darse de alta en el círculo, compartir el hábito con `circle_join`, pedir al
owner que te añada, reconectar la cuenta). Ejemplo: si el error dice que el
emisor no está en el círculo, NO digas "ha dado 404"; di que todavía no está
apuntado al reto y cómo unirse.

> Detalle interno (no es para el usuario): los check-ins de círculo
> (`circle_report`, `circle_undo`) usan el token de círculo compartido y el
> `userId` del emisor, que se resuelve solo a partir de su identidad de
> WhatsApp contra la lista de miembros del círculo. Si el emisor no es miembro,
> la herramienta lo dice con un mensaje accionable.
