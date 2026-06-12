---
name: mikoshi-tracker
description: >
  Gestión personal de hábitos vía MikoshiTracker. Cada llamada usa el token
  personal del emisor (resuelto per-user por SecretResolver); nunca actúa en
  nombre de otro. Cubre CRUD de hábitos, check-ins de hoy y estadísticas
  generales de tus hábitos.
metadata:
  mikoshi:
    tags:
      - habits
      - productivity
      - personal
    tools:
      - name: habits_list
        description: >
          Lista tus hábitos personales de MikoshiTracker. Filtra por estado
          (activo/archivado), texto libre, categoría o tipo (boolean/quantity).
          Úsala cuando alguien pregunte "¿cuáles son mis hábitos?", "muéstrame
          mis retos" o quiera ver su lista de hábitos.
          Cada hábito devuelto incluye `sharedInCircles` (lista de
          `{circleId, name}`) cuando está compartido en uno o más círculos;
          ausente o vacío = privado. Es la fuente de verdad para responder qué
          hábito puntúa en qué reto: léelo de la respuesta, NO se lo preguntes
          al usuario.
        inputSchema:
          type: object
          properties:
            query:
              type: string
              description: "Texto libre para buscar en el nombre y descripción del hábito"
            status:
              type: string
              enum: ["active", "archived"]
              description: "Filtrar por estado (activo por defecto si se omite)"
            category:
              type: string
              description: "Filtrar por categoría exacta"
            kind:
              type: string
              enum: ["boolean", "quantity"]
              description: "Filtrar por tipo de hábito"
        risk: external-read
      - name: habits_add
        description: >
          Crea un nuevo hábito personal en MikoshiTracker. Úsala cuando
          alguien quiera añadir un hábito nuevo a su cuenta. La frecuencia
          define cuándo se espera que el usuario complete el hábito; para
          hábitos de cantidad (kind=quantity) es obligatorio indicar targetValue.
          Antes de crear, comprueba con habits_list que no exista ya un hábito
          equivalente. Si el usuario está REFORMULANDO uno que ya tiene (mismo
          objetivo, mejor redactado), usa habits_edit para renombrarlo en su
          sitio en vez de crear un casi-duplicado: duplicar fragmenta el
          historial y puede dejar el hábito de verdad fuera de un círculo.
        inputSchema:
          type: object
          properties:
            name:
              type: string
              description: "Nombre del hábito (requerido)"
            kind:
              type: string
              enum: ["boolean", "quantity"]
              description: "Tipo: boolean (completado/no) o quantity (valor numérico)"
            description:
              type: string
              description: "Descripción opcional del hábito"
            category:
              type: string
              description: "Categoría opcional para agrupar hábitos"
            targetValue:
              type: integer
              description: "Objetivo numérico diario (requerido si kind=quantity)"
            unit:
              type: string
              description: "Unidad de medida (p. ej. 'vasos', 'minutos')"
            startDate:
              type: string
              description: "Fecha de inicio en formato YYYY-MM-DD"
            isActive:
              type: boolean
              description: "Si el hábito está activo (true por defecto)"
            frequency:
              type: object
              description: >
                Frecuencia del hábito. Variantes posibles:
                { type: 'daily' } — todos los días;
                { type: 'weekly_count', count: N } — N veces por semana;
                { type: 'weekdays', days: ['monday','tuesday',...] } — días concretos de la semana;
                { type: 'monthly_count', count: N } — N veces al mes.
              properties:
                type:
                  type: string
                  enum: ["daily", "weekly_count", "weekdays", "monthly_count"]
                count:
                  type: integer
                  description: "Número de veces (para weekly_count y monthly_count)"
                days:
                  type: array
                  items:
                    type: string
                    enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
                  description: "Días de la semana (para weekdays)"
              required:
                - type
          required:
            - name
            - frequency
        risk: external-write
      - name: habits_get_detail
        description: >
          Obtiene el detalle completo de un hábito: estadísticas (racha actual,
          racha máxima, total de completados), historial reciente y tendencia
          de los últimos 7 y 30 días. Úsala cuando alguien pregunte "¿cómo
          va mi hábito de X?" o quiera ver el detalle de un hábito concreto.
          Resuelve el hábito con un matcher contextual (tolera paráfrasis,
          sinónimos y lenguaje indirecto): pasa palabras distintivas en `habit`
          y, si la petición es indirecta, `context` con lo que dijo el usuario.
          Si sigue siendo ambiguo, la tool devuelve la lista de candidatos para
          que preguntes cuál.
        inputSchema:
          type: object
          properties:
            habit:
              type: string
              description: "Palabras distintivas (o id) del hábito a consultar"
            context:
              type: string
              description: "Opcional: frase literal del usuario o pista para desambiguar paráfrasis/lenguaje indirecto"
          required:
            - habit
        risk: external-read
      - name: habits_edit
        description: >
          Edita los campos modificables de un hábito existente. El tipo (kind)
          es inmutable una vez creado. Envía solo los campos que se quieren
          cambiar; los demás permanecen intactos. Úsala cuando alguien quiera
          cambiar el nombre, la descripción, la categoría, el objetivo, la
          unidad, la fecha de inicio o la frecuencia de un hábito.
          Resuelve el hábito con un matcher contextual; si es genuinamente
          ambiguo, la tool devuelve los candidatos para que preguntes cuál (no
          edites a ciegas). Editar es preferible a archivar+recrear cuando solo
          cambia el enunciado: conserva historial, racha y pertenencia a círculos.
        inputSchema:
          type: object
          properties:
            habit:
              type: string
              description: "Palabras distintivas (o id) del hábito a editar"
            context:
              type: string
              description: "Opcional: frase literal del usuario o pista para desambiguar paráfrasis/lenguaje indirecto"
            patch:
              type: object
              description: "Campos a modificar (al menos uno requerido)"
              properties:
                name:
                  type: string
                  description: "Nuevo nombre del hábito"
                description:
                  type: string
                  description: "Nueva descripción (null para borrar)"
                  nullable: true
                category:
                  type: string
                  description: "Nueva categoría (null para borrar)"
                  nullable: true
                targetValue:
                  type: integer
                  description: "Nuevo objetivo numérico"
                unit:
                  type: string
                  description: "Nueva unidad (null para borrar)"
                  nullable: true
                startDate:
                  type: string
                  description: "Nueva fecha de inicio en formato YYYY-MM-DD"
                frequency:
                  type: object
                  description: "Nueva frecuencia (misma estructura que en habits_add)"
                  properties:
                    type:
                      type: string
                      enum: ["daily", "weekly_count", "weekdays", "monthly_count"]
                    count:
                      type: integer
                    days:
                      type: array
                      items:
                        type: string
                        enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
                  required:
                    - type
          required:
            - habit
            - patch
        risk: external-write
      - name: habits_archive
        description: >
          Archiva un hábito activo: deja de aparecer en la lista activa y de
          contar para hoy, pero su historial se conserva (reversible con
          habits_restore). Archivar NO es inocuo: es retirar el hábito del
          juego. NO lo uses como atajo para "limpiar"; piensa antes.

          Antes de archivar, SIEMPRE:
          (1) Resuelve sin ambigüedad CUÁL hábito archivas. Si el usuario lo
          nombra de forma aproximada o hay varios de nombre parecido, lista
          (habits_list) y confirma el id exacto; nunca archives "a ojo".
          (2) Si parece un DUPLICADO o un REEMPLAZO de otro (p. ej. reformular
          "el de las 6:30" como "levantarme cuando suena el despertador"), no
          des por hecho cuál sobra. Averigua si el que vas a retirar participa
          en algún reto/círculo de grupo: la API personal NO lo reporta, así
          que dedúcelo del contexto o pregúntalo. Si está en un círculo,
          archivarlo lo saca del concurso y deja el reemplazo fuera.
          (3) Si solo quieres afinar el enunciado (mismo hábito, mejor
          redactado), prefiere habits_edit (renombrar/ajustar in situ):
          conserva historial y pertenencia a círculos. Reserva archive +
          crear-nuevo para cuando de verdad sea otro hábito distinto.
          (4) Si el hábito a archivar está compartido en un círculo y hay un
          reemplazo, comparte primero el reemplazo (circle_join del skill
          mikoshi-tracker-circle) y solo entonces archiva el viejo, para que
          el reto nunca se quede sin tu hábito vivo.

          Al archivar, di con precisión qué archivas y por qué; no lo llames
          "duplicado" sin haber confirmado cuál es el canónico, cuál está
          activo y cuál está compartido en un círculo.
          La respuesta incluye `wasSharedInCircles` (lista de retos) cuando el
          hábito archivado estaba compartido en algún círculo: si aparece,
          AVÍSALE al usuario que ya no puntúa ahí y ofrécele compartir el
          reemplazo con circle_join.
        inputSchema:
          type: object
          properties:
            habit:
              type: string
              description: "Palabras distintivas (o id) del hábito a archivar"
            context:
              type: string
              description: "Opcional: frase literal del usuario o pista para desambiguar paráfrasis/lenguaje indirecto"
          required:
            - habit
        risk: external-write
      - name: habits_restore
        description: >
          Restaura un hábito archivado, volviéndolo a activar. Úsala cuando
          alguien quiera retomar un hábito que tenía archivado. Si hay varios
          archivados de nombre parecido, la tool devuelve los candidatos para que
          confirmes cuál antes de restaurar.
        inputSchema:
          type: object
          properties:
            habit:
              type: string
              description: "Palabras distintivas (o id) del hábito archivado a restaurar"
            context:
              type: string
              description: "Opcional: frase literal del usuario o pista para desambiguar paráfrasis/lenguaje indirecto"
          required:
            - habit
        risk: external-write
      - name: today_get_summary
        description: >
          Devuelve el resumen de hoy: qué hábitos tiene el usuario programados
          para hoy, cuáles están completados y cuáles pendientes. Úsala cuando
          alguien pregunte "¿qué tengo para hoy?", "¿cómo van mis hábitos de
          hoy?" o quiera ver su progreso diario.
        inputSchema:
          type: object
          properties: {}
        risk: external-read
      - name: today_complete
        description: >
          Marca un hábito como completado para hoy. Para hábitos de tipo
          boolean registra la compleción; para hábitos de cantidad, usa
          today_set_total en su lugar. Úsala cuando alguien diga "ya hice X"
          o "completé mi hábito de X". Resuelve el hábito con un matcher
          contextual (pasa palabras distintivas + `context`); si es ambiguo, la
          tool devuelve los candidatos para que preguntes cuál antes de marcar.
        inputSchema:
          type: object
          properties:
            habit:
              type: string
              description: "Palabras distintivas (o id) del hábito a marcar como completado"
            context:
              type: string
              description: "Opcional: frase literal del usuario o pista para desambiguar paráfrasis/lenguaje indirecto"
            note:
              type: string
              description: "Nota opcional sobre el check-in"
          required:
            - habit
        risk: external-write
      - name: today_set_total
        description: >
          Registra el valor total acumulado de hoy para un hábito de cantidad.
          Reemplaza el total del día, no lo suma. Úsala cuando alguien diga
          "bebí 2 litros de agua hoy" o quiera establecer el valor exacto de
          un hábito de cantidad. Resuelve el hábito con un matcher contextual; si
          es ambiguo, la tool devuelve los candidatos para que preguntes cuál.
        inputSchema:
          type: object
          properties:
            habit:
              type: string
              description: "Palabras distintivas (o id) del hábito de cantidad"
            context:
              type: string
              description: "Opcional: frase literal del usuario o pista para desambiguar paráfrasis/lenguaje indirecto"
            total:
              type: integer
              description: "Valor total del día (reemplaza el actual)"
            note:
              type: string
              description: "Nota opcional sobre el registro"
          required:
            - habit
            - total
        risk: external-write
      - name: today_undo
        description: >
          Deshace el último check-in de hoy del hábito indicado. Úsala cuando
          alguien diga "me equivoqué con X", "deshaz mi registro de X de hoy"
          o quiera revertir un check-in del día actual. Resuelve el hábito con un
          matcher contextual; si es ambiguo, la tool devuelve los candidatos.
        inputSchema:
          type: object
          properties:
            habit:
              type: string
              description: "Palabras distintivas (o id) del hábito cuyo check-in de hoy deshacer"
            context:
              type: string
              description: "Opcional: frase literal del usuario o pista para desambiguar paráfrasis/lenguaje indirecto"
            note:
              type: string
              description: "Nota opcional sobre el motivo del undo"
          required:
            - habit
        risk: external-write
      - name: stats_get_overview
        description: >
          Devuelve estadísticas generales del usuario: resumen de todas las
          rachas, total de completados, tasa de éxito global y otros KPIs de
          alto nivel. Úsala cuando alguien pregunte "¿cómo voy con mis hábitos
          en general?", "¿cuál es mi racha más larga?" o quiera un resumen
          global.
        inputSchema:
          type: object
          properties: {}
        risk: external-read
    secrets:
      required: []
      optional:
        - mikoshi_tracker_personal_token
        - mikoshi_tracker_api_url
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
      tool: habits_list
      input: {}
---

# MikoshiTracker — Gestión personal de hábitos

Accede y gestiona **tus hábitos** de MikoshiTracker. Cada operación se autentica
con el token personal del emisor — nunca actúa en nombre de otro. El servidor
MikoshiTracker actúa como límite de seguridad: el token resuelto per-identity
por SecretResolver jamás se comparte entre callers distintos.

## Cuándo usar cada herramienta

### `habits_list`

Úsala cuando alguien quiera ver su lista de hábitos:

- "¿Cuáles son mis hábitos?" → `{}`
- "Muéstrame mis hábitos activos de salud." → `{ category: "salud" }`
- "¿Tengo hábitos archivados?" → `{ status: "archived" }`
- "¿Cuál de mis hábitos está en el círculo / en el reto?" → `{}`, y lee
  `sharedInCircles` de cada hábito en la respuesta. **No preguntes al usuario
  cuál es: el dato ya viene en la lista.** Nómbralo con el `name` del círculo
  (p.ej. "*Kettlebell 15 min* puntúa en *Operación Bikini*; *Entrenamiento
  Kettlebell* es privado").

### `habits_add`

Úsala cuando alguien quiera crear un hábito nuevo:

- "Quiero añadir el hábito de meditar 10 minutos cada día."
  → `{ name: "Meditación 10 min", kind: "boolean", frequency: { type: "daily" } }`
- "Añade beber 8 vasos de agua al día."
  → `{ name: "Agua", kind: "quantity", targetValue: 8, unit: "vasos", frequency: { type: "daily" } }`

### `habits_get_detail`

Úsala cuando alguien quiera ver el historial o estadísticas de un hábito concreto:

- "¿Cómo va mi hábito de meditación?"
- "¿Cuántos días llevo con la lectura?"

### `habits_edit`

Úsala cuando alguien quiera modificar un hábito existente (nombre, objetivo, frecuencia…):

- "Cambia el objetivo de agua a 10 vasos."
  → `{ habit: "Agua", patch: { targetValue: 10 } }`

### `habits_archive` / `habits_restore`

Úsala para pausar un hábito sin perder su historial (`habits_archive`) o retomarlo
más tarde (`habits_restore`).

**Archivar es una operación con consecuencias — razónala, no la dispares.**
Sigue este árbol de decisión antes de cada `habits_archive`:

1. **Confirma el objetivo exacto.** Si el usuario nombra el hábito de forma
   vaga ("el de las 6:30") o hay varios parecidos, llama primero a `habits_list`
   y archiva por **id**, no por nombre aproximado. Si tras listar sigue habiendo
   ambigüedad, pregunta cuál antes de tocar nada.

2. **¿Es un duplicado o un reemplazo?** Cuando el usuario está sustituyendo un
   hábito por otro mejor formulado, hay **dos hábitos que parecen lo mismo**.
   No asumas que el que sobra es intercambiable con el que se queda:
   - **¿Solo cambia el enunciado** (mismo hábito, mejor redactado, misma
     frecuencia)? → **No archives + crees uno nuevo.** Usa `habits_edit` para
     renombrar/ajustar el existente. Así conservas historial, racha **y**
     cualquier pertenencia a un círculo.
   - **¿Es de verdad otro hábito distinto?** → entonces sí tiene sentido crear
     el nuevo y archivar el viejo, pero antes ve al punto 3.

3. **¿El hábito a archivar está en un círculo (reto de grupo)?** La respuesta de
   `habits_archive` trae `wasSharedInCircles` con los retos afectados cuando los
   hay (y el backend puede no reportarlo en versiones antiguas; ante la duda en
   un grupo, trátalo como posible). Si está en un círculo:
   - Archivarlo lo **saca del concurso**. Si el usuario tiene un reemplazo
     privado, el reto se queda **sin su hábito vivo**.
   - Movimiento correcto: **comparte primero el reemplazo** al círculo con
     `circle_join` (skill `mikoshi-tracker-circle`) y **solo entonces** archiva
     el viejo. Nunca dejes el hueco abierto.
   - Si ya lo archivaste y `wasSharedInCircles` viene con retos, **avísale** al
     usuario y ofrécele compartir el reemplazo para no perder el puesto.

4. **Sé honesto al narrar.** No llames "duplicado" a algo sin haber confirmado
   cuál es el canónico, cuál está activo y cuál está compartido. Explica qué
   archivas, qué se queda vivo y qué pasa con el círculo si lo había.

**Regla de oro:** ante la duda entre `habits_archive` y `habits_edit`, prefiere
`habits_edit`. Editar nunca pierde historial ni saca un hábito de un reto;
archivar sí. Solo archiva cuando el usuario quiere de verdad retirar el hábito.

### `today_get_summary`

Úsala cuando alguien quiera saber qué tiene que hacer hoy o cómo va su jornada:

- "¿Cómo van mis hábitos de hoy?"
- "¿Qué me queda por hacer?"

### `today_complete`

Úsala cuando alguien marque un hábito como completado hoy:

- "Ya medité." → `{ habit: "meditación" }`
- "Completé la lectura." → `{ habit: "lectura", note: "30 min de novela" }`

### `today_set_total`

Úsala para registrar el valor acumulado de hoy en un hábito de cantidad:

- "Bebí 6 vasos de agua hoy." → `{ habit: "agua", total: 6 }`

### `today_undo`

Úsala para revertir un check-in erróneo de hoy:

- "Deshaz mi meditación de hoy, me confundí." → `{ habit: "meditación" }`

### `stats_get_overview`

Úsala cuando alguien quiera un resumen global de su progreso:

- "¿Cómo voy en general con mis hábitos?"
- "¿Cuál es mi racha más larga?"

## Reglas de uso

**Matching contextual del hábito — nunca actúes sobre el hábito equivocado.**
Las tools que reciben `habit` por nombre (`habits_get_detail`, `habits_edit`,
`habits_archive`, `habits_restore`, `today_complete`, `today_set_total`,
`today_undo`) ya **no** cogen la primera coincidencia a ciegas: resuelven con un
matcher contextual que tolera paráfrasis, sinónimos, erratas, reordenación y
lenguaje indirecto ("ésta", "la de antes"), apoyado en un LLM cuando no hay
coincidencia literal.

- Pasa en `habit` las **palabras distintivas** (no la frase entera del usuario)
  y, si la petición es indirecta, rellena `context` con lo que dijo.
- Si el hábito sigue siendo **genuinamente ambiguo**, la tool **no adivina**:
  devuelve un error con la lista de candidatos y su descriptor (tipo sí/no vs
  cantidad, objetivo/unidad). En ese caso, **explícale al usuario en lenguaje
  llano qué es cada hábito y pregúntale cuál** — no elijas tú.
- Misma cautela en lecturas.

**Compartido vs privado lo resuelves TÚ, no el usuario.** Para saber qué hábito
está en un círculo (o en cuál), la fuente de verdad es `sharedInCircles` de
`habits_list` — viene poblado por el backend en cada listado. Si el usuario dice
"uno de estos está en mi círculo y el otro no", NO le preguntes cuál: llama a
`habits_list`, lee `sharedInCircles` de cada hábito y dilo tú con el `name` del
círculo. Sólo entonces, si toca limpiar un duplicado, propón la acción segura
(archivar el privado, conservar el del reto). Pedir que te lo diga el usuario
cuando el dato ya está en la lista es delegar trabajo que ya puedes hacer.

**Explica los cambios relevantes del sistema.** En éxito rutinario, una
confirmación breve basta. Pero cuando una acción cambia algo no obvio, NÁRRALO:
- Al archivar un hábito compartido en un círculo (la respuesta trae
  `wasSharedInCircles`), avisa que ya no puntúa en ese reto y ofrece compartir el
  reemplazo con `circle_join`.
- Al marcar/deshacer, usa el `summary` que devuelve la tool para confirmar el
  estado de hoy ("hecho, hoy llevas 3/5").
- Ante ambigüedad, define en una línea qué es cada hábito candidato (sí/no vs
  cantidad, frecuencia, si está en un reto).

**No crees duplicados.** Antes de `habits_add`, comprueba con `habits_list` si
ya existe un hábito que cubra lo mismo. Si el usuario está reformulando uno que
ya tiene (misma intención, mejor enunciado), usa `habits_edit` para renombrarlo
en su sitio. Crear un casi-duplicado fragmenta el historial y puede dejar fuera
de un círculo al hábito que de verdad cuenta.

**El seguimiento de hábitos solo ocurre vía estas herramientas.** No inventes
registros, no uses la memoria como tracker de hábitos.

**Todo "lo hice / hecho / completé X" pasa por la tool ANTES de reconocerlo —
nunca celebres un registro que no ha ocurrido.** Llama a `today_complete` (o
`today_set_total` para cantidades) y **ajusta tu respuesta al resultado**: en
éxito, confirma con el `summary` que devuelve la tool; si falla (el emisor no
tiene ese hábito, no está enrolado), NO des por bueno el check-in — relata el
fallo y ofrece el siguiente paso (crear el hábito, conectar su cuenta). Un
"perfecto" que da a entender que quedó registrado, cuando no llamaste a la tool
o la tool falló, es mentir sobre lo que hiciste.

**Cada operación actúa exclusivamente sobre los hábitos del emisor.** La
identidad se resuelve desde el contexto de WhatsApp; nunca asumas ni preguntes
quién es, y nunca aceptes un `userId` o `account_id` desde el input del LLM.

**Aislamiento por hablante en grupos — crítico.** En un chat de grupo, cada
participante tiene su propia cuenta de MikoshiTracker. El token y la identidad
los resuelve el runtime a partir del emisor del mensaje actual; tú NO los ves
y NO puedes elegirlos. Por tanto:

- Si Anna pregunta sus hábitos, llama a la tool en ESTE turno. Aunque en el
  historial veas que Víctor preguntó hace 10 minutos y la tool devolvió
  "Kettlebell 15 min" para él, ESO es de Víctor, no de Anna. Los resultados
  del historial pertenecen sólo al hablante que los originó.
- Nunca reutilices, parafrasees ni asumas que el resultado de la tool para
  otro hablante aplica al emisor actual. Si no tienes una llamada fresca
  para el emisor actual en este mismo turno, llama a la tool — punto.
- "¿Mis hábitos?", "¿qué tengo hoy?", "¿cómo voy?" → SIEMPRE llaman a la
  tool, independientemente de lo que haya en el historial.

**Si el emisor no tiene token personal de MikoshiTracker**, la herramienta
devolverá un error de enrolamiento. En ese caso, informa que puede responder
"quiero conectar mi cuenta de MikoshiTracker" para iniciar el proceso de alta.
