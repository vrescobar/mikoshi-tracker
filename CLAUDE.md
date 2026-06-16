## Design Context

### Users

MikoshiTracker serves individual self-hosting users who open the product throughout the day to understand what must be done now, what is already complete, and whether their habit system is healthy overall. The interface needs to support fast scanning, low cognitive load, and strong trust because the same data also powers AI-assisted check-ins.

### Brand Personality

Calm, refined, reliable. The product should feel polished enough to trust with daily routines, but restrained enough to stay out of the user's way.

### Aesthetic Direction

Light-mode first, with a calm, modern **wellness-app** language: a soft sidebar
shell, generous whitespace, rounded surfaces with soft shadows (not boxed
borders), and Plus Jakarta Sans for both display and body. The system accent is
**emerald** (`--color-accent: #10b981`); diet/nutrition uses a **coral** accent
(`--color-accent-diet`); each habit category carries its own pastel token
(water / move / mind / rest / food / streak). Progress is shown with **rings**,
**7/30-day compliance strips & heatmaps**, and a single restrained **streak
flame** — encouraged, not "noisy gamification": no confetti, no bouncing, the
number does the talking. Sections (Diet, Habits, Circles, Settings) are
organized with a shared **Tabs** primitive; pages lead with a clean title + tabs
rather than a heavy gradient hero. Still avoid: purple-on-white SaaS defaults and
decorative motion that competes with the work. The user's reference mockups (a
green progress ring, macro tiles, "quick re-log", a Comida/Diet board) are the
craft benchmark for this direction.

### Design Principles

- Make today's priorities readable at a glance; the ring + streak summarize state before any list.
- Use one coherent visual system (tokens in `globals.css`, shared `ui/` primitives — Tabs, Toggle, ProgressRing, Surface) across auth, dashboard, habits, diet, circles, and settings.
- Calm confidence over novelty: rings, streaks, and flames stay quiet and informative, never celebratory clutter.
- Let typography, spacing, category color, and contrast establish hierarchy before gradients or ornament.
- Make responsive behavior, empty states (with an "or ask Mikoshi on WhatsApp" nudge), errors, and loading feedback feel first-class, in all three locales (en / es / zh-CN).
