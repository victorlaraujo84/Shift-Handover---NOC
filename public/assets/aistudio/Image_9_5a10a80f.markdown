---
name: Shift Command Telemetry
colors:
  surface: '#0f131d'
  surface-dim: '#0f131d'
  surface-bright: '#353944'
  surface-container-lowest: '#0a0e18'
  surface-container-low: '#171b26'
  surface-container: '#1c1f2a'
  surface-container-high: '#262a35'
  surface-container-highest: '#313540'
  on-surface: '#dfe2f1'
  on-surface-variant: '#bec8d2'
  inverse-surface: '#dfe2f1'
  inverse-on-surface: '#2c303b'
  outline: '#88929b'
  outline-variant: '#3e4850'
  surface-tint: '#89ceff'
  primary: '#89ceff'
  on-primary: '#00344d'
  primary-container: '#0ea5e9'
  on-primary-container: '#003751'
  inverse-primary: '#006591'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#c0c1ff'
  on-tertiary: '#1000a9'
  tertiary-container: '#8d90ff'
  on-tertiary-container: '#1407ad'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c9e6ff'
  primary-fixed-dim: '#89ceff'
  on-primary-fixed: '#001e2f'
  on-primary-fixed-variant: '#004c6e'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#0f131d'
  on-background: '#dfe2f1'
  surface-variant: '#313540'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  label-mono-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system is engineered for mission-critical Network Operations Centers (NOC), telecommunications infrastructure monitoring, and real-time operational shift handovers. It delivers an authoritative, hyper-focused interface that eliminates visual noise while accelerating triaging, incident handoffs, and SLA tracking under high-stress conditions.

Drawing inspiration from developer-grade platforms like Linear and observability suites like Datadog, the design combines a modern dark telemetry aesthetic with surgical precision. It balances dense, structured data presentation with immediate cognitive clarity. The atmosphere is quiet, deep, and vigilant—relying on dark slate surfaces, subtle structural borders, and electric semantic beacons to direct operator focus to anomalies, incident escalations, and system handoffs without visual fatigue.

## Colors

The color system operates on deep slate foundations to maintain optical ergonomics during prolonged 24/7 shifts:

- **Canvas Background:** `#0B0F19` provides an ultra-low-luminance backdrop that recedes from perception.
- **Surface Elevation 1 (Cards, Toolbars):** `#111827` creates stable structural segments.
- **Surface Elevation 2 (Hover States, Nested Modules):** `#1F2937` provides interactive and active containment layers.
- **Structural Outlines:** `#374151` delivers crisp boundary demarcation without high-contrast friction.
- **Primary Operational (`#0EA5E9`):** Dynamic Sky/Cyan used for primary interactions, active filters, telemetry focus, and external sync triggers.
- **Semantic Signals:**
  - **Success / Healthy / Handover Accepted (`#10B981`):** Emerald green for operational nominal states, acknowledged runbooks, and closed tickets.
  - **Warning / Degraded / Follow-up Needed (`#F59E0B`):** Radiant amber for imminent SLA breaches, flapping circuits, and pending shift items.
  - **Critical / Outage / Breach (`#EF4444`):** Crimson red for P1/P0 outages, packet-drop surges, and unassigned critical alerts.
  - **Collaboration & Bridge Links (`#2563EB` to `#3B82F6`):** Teams bridges, Jira incident tracking keys, and internal bridge channels.
  - **Integrations & Third-Party (`#6366F1`):** Indigo/Violet for Chatwoot omnichannel queues, external carrier webhooks, and automated probes.

## Typography

Typography enforces strict operational hierarchy across narrative content and machine telemetry:

- **Display & Headlines (Plus Jakarta Sans):** Geometric, modern, and legible. Used for shift summaries, service cluster headers, and high-level handover views.
- **Operational Body (Geist):** Neutral, high x-height, screen-optimized sans-serif designed for incident logs, handover handoffs, operator notes, and runbook step execution.
- **Machine & Telemetry (JetBrains Mono):** Monospaced type for all technical data tokens: Jira keys (`OPS-4091`), IP addresses, latency figures (`18.4ms`), SLA countdown timers, UTC timestamps, and circuit IDs (`CKT-BR-SP-09`). Numeric tabular alignments ensure jitter-free table scans.

## Layout & Spacing

The layout model favors dense operational utility over decorative whitespace. Screens are built around a modular grid optimized for multi-monitor NOC displays (1080p, 1440p, and ultra-wide dashboards) while remaining adaptive down to field tablets:

- **Grid Architecture:** Multi-column responsive layout with tight 12px (`0.75rem`) gutters and 16px (`1rem`) viewport margins. High density enables operators to monitor telemetry graphs, incident handoffs, and ongoing communication bridges simultaneously.
- **Information Density:** Component padding prioritizes compact spacing (`space-xs` and `space-sm`) for tabular rows and key-value monitors, reserving `space-md` and `space-lg` for module cards and modal dialogs.
- **Reflow Behavior:** On desktop/ultra-wide, interfaces split into a 3-pane workstation: left pane for Shift Handover checklist & queue, center for active circuit/incident telemetry, and right for Teams/Chatwoot bridge feeds. On tablet/mobile, panes transition to a stacked tabbed view with sticky status headers.

## Elevation & Depth

This system avoids heavy drop shadows in favor of **tonal layers and crisp micro-borders**, preserving contrast integrity and UI speed:

- **Elevation 0 (Canvas):** Base background `#0B0F19`. Flat, non-interactive.
- **Elevation 1 (Panels & Cards):** Surface `#111827` framed with a 1px solid border of `#374151`.
- **Elevation 2 (Interactive Floating & Hover States):** Surface `#1F2937` with an ambient glow (`box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45)`).
- **Incident Overlays & Popovers:** Surface `#1F2937` with elevated edge definition (`border: 1px solid #4B5563` and `box-shadow: 0 12px 24px -4px rgba(0, 0, 0, 0.65)`).
- **Critical Pulsing:** Severe incident tiles utilize an inner edge tint (`box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.4)`) accompanied by a subtle ambient back-glow rather than standard blur shadows.

## Shapes

The design uses roundedness factor `2` (`0.5rem` / 8px for standard containers) to deliver a modern, polished look while retaining the structure of high-density tooling:

- **Containers & Data Panels:** Default radius of `0.5rem` (`rounded-md`).
- **Pills, Badges & Severity Chips:** Inner radius of `0.25rem` (`rounded-sm`) to `0.375rem`, ensuring badge content remains tightly framed without excessive roundness that wastes space.
- **Interactive Action Buttons:** Uniform `0.5rem` (`rounded-md`) matching panel corner radii for architectural continuity.
- **Input Fields & Code Blocks:** Strict `0.375rem` to `0.5rem` corner framing.

## Components

### Buttons & Operational Actions
- **Primary Operational Button:** `#0EA5E9` background with high-contrast `#082F49` or white text, 8px corner radius, bold/semibold `Geist` font. Focus rings are electric cyan with a 2px offset in `#0B0F19`.
- **Destructive / Escalation Button:** Deep red `#EF4444` background or `#EF4444` outline for incident escalations and circuit disconnect confirmations.
- **Secondary Ghost Button:** `#1F2937` background, `#374151` border, light gray text. Hover state brightens border to `#4B5563`.
- **Micro Handover Action Buttons:** Compact 28px height, utilizing monospaced icons with labels like `ACK`, `HANDOVER`, or `SYNC`.

### Severity Badges & Status Chips
- Built with a dual-layer approach: 15% opacity tinted background with 100% full-chroma text and matching 1px border.
  - **P0 / Critical:** Background `rgba(239, 68, 68, 0.15)`, text `#F87171`, border `rgba(239, 68, 68, 0.4)`. Includes optional pulsing dot indicator.
  - **P1 / High:** Background `rgba(245, 158, 11, 0.15)`, text `#FBBF24`, border `rgba(245, 158, 11, 0.4)`.
  - **Normal / Nominal:** Background `rgba(16, 185, 129, 0.15)`, text `#34D399`, border `rgba(16, 185, 129, 0.3)`.
- **System Tags:** Monospace pills (`JetBrains Mono`) for Jira keys (`[JIRA: INC-9812]`), Chatwoot conversation IDs (`[CW #412]`), and carrier identifiers (`[CIRCUIT: EMBRATEL-01]`).

### High-Density Telemetry Tables
- **Header:** Sticky `#111827` surface with 1px bottom border `#374151`. Monospaced uppercase captions with sort state indicators.
- **Rows:** Minimum height of 36px for extreme compact viewing; alternating or hover state transitions to `#1F2937`.
- **Cell Content:** Tabular monospaced alignment for timestamps, packet counts, ping latencies, and circuit IDs. Text truncation with instant tooltip previews.

### Form Inputs & Search Filters
- Background `#111827`, border `#374151`, text `#F3F4F6`. Placeholder text in muted slate (`#6B7280`).
- Global search input features immediate keyboard shortcut visual indicators (`⌘K` or `/`) styled in monospaced badges.

### Shift Handover Cards
- Specialized card modules featuring a three-stage lifecycle: **Pending Acceptance**, **In Review**, and **Acknowledged/Closed**.
- Left-hand accent indicator (3px border) tinted according to the shift's dominant unresolved severity state.
- Embedded checklists for checklist items, circuit handoffs, active bridge links (Teams button with `#2563EB` accent), and outgoing operator sign-off signatures.