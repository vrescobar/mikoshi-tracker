---
name: mikoshi-tracker-report
description: >
  Genera y envía gráficos de nutrición de MikoshiTracker por WhatsApp bajo
  demanda. El tracker renderiza el PNG (tendencia de calorías o composición de
  macros) y lo entrega al DM del emisor mediante la plataforma Mikoshi. Solo
  actúa con el token del emisor y solo envía al propio emisor; nunca a terceros.
metadata:
  mikoshi:
    tags:
      - report
      - chart
      - nutrition
      - gráfico
      - informe
    tools:
      - name: report_send_chart
        description: >
          Renderiza un gráfico de nutrición y lo envía como imagen al WhatsApp
          del emisor. Úsalo cuando el usuario pida "mándame/enséñame mi gráfica
          de calorías/macros". `kind` elige el gráfico: `kcal-trend` (línea de
          calorías por día con la línea de objetivo) o `macro-donut`
          (composición de macros). `range` por defecto 7d.
        inputSchema:
          type: object
          properties:
            kind:
              type: string
              enum: ["kcal-trend", "macro-donut"]
              description: "Tipo de gráfico (por defecto kcal-trend)"
            range:
              type: string
              enum: ["7d", "30d", "90d"]
              description: "Ventana temporal (por defecto 7d)"
            caption:
              type: string
              description: "Texto opcional que acompaña a la imagen"
        risk: external-write
    secrets:
      required: []
      optional:
        - mikoshi_tracker_personal_token
        - mikoshi_tracker_api_url
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
      tool: report_send_chart
      input:
        kind: kcal-trend
        range: 7d
---

# MikoshiTracker Report — Gráficos por WhatsApp

Envía gráficos de nutrición del usuario a su propio WhatsApp bajo demanda.

## Cómo funciona

1. El usuario pide un gráfico en el chat ("mándame mi gráfica de calorías de
   esta semana").
2. Esta skill llama a `POST /api/v1/reports/chart` del tracker con el **token
   personal del emisor**.
3. El tracker renderiza el PNG con sus propios datos (scope estricto al emisor)
   y lo entrega al DM de WhatsApp mediante la plataforma Mikoshi (`notify` en
   modo imagen). Los bytes y el token nunca salen del tracker.

## Reglas

- **Solo el emisor.** Nunca aceptes ni pases un `userId`; el gráfico es siempre
  del propio usuario que pide.
- **`kind`**: `kcal-trend` para la tendencia diaria de calorías (incluye la
  línea de objetivo si hay una meta de dieta), `macro-donut` para la
  composición de macros.
- **`range`**: `7d` (por defecto), `30d` o `90d`.
- Si la respuesta indica `delivered: false`, explica el motivo al usuario:
  - `no_identity`: el usuario aún no tiene identidad de Mikoshi vinculada.
  - `platform_unavailable`: la plataforma de mensajería no está disponible.
  - `delivery_failed`: el envío falló; reintentar más tarde.

## Resultado

Devuelve `{ status: "ok", delivered, reason? }` o
`{ status: "failed", error }`.
