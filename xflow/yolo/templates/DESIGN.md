# Design System Template

> This template follows the DESIGN.md format from Google Stitch / awesome-design-md.
> Drop into project root as `DESIGN.md` or merge into `specs/ux.md`.

## Brand & Purpose

- Product: [what the product is]
- Audience: [who uses it]
- Core value: [one-line positioning statement]

## Visual Tone

- Primary tone: [minimal | maximalist | brutalist | editorial | organic | luxury | playful | industrial | retro-futuristic | dark-mode-first]
- Secondary tone: [optional refinement or modifier]
- Reference brand: [optional, e.g., "similar to Linear" or "inspired by Notion"]

## Color System

| Token | Value | Usage |
|-------|-------|-------|
| Background | [color] | Primary page background |
| Surface | [color] | Cards, panels, elevated surfaces |
| Primary | [color] | Main brand color, key actions |
| Accent | [color] | Highlights, links, focus states |
| Text | [color] | Primary text content |
| Text Muted | [color] | Secondary text, placeholders |
| Border | [color] | Dividers, input borders |
| Success | [color] | Positive states, confirmations |
| Error | [color] | Errors, destructive actions |
| Warning | [color] | Caution states |

Define as CSS variables:

```css
:root {
  --color-background: [value];
  --color-surface: [value];
  --color-primary: [value];
  --color-accent: [value];
  --color-text: [value];
  --color-text-muted: [value];
  --color-border: [value];
  --color-success: [value];
  --color-error: [value];
  --color-warning: [value];
}
```

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display | [font family] | [weight] | [size range] |
| Heading | [font family] | [weight] | [size range] |
| Body | [font family] | [weight] | [base size] |
| Mono | [font family] | [weight] | [size] |
| Label | [font family] | [weight] | [size] |

Typography scale (optional):

```css
:root {
  --font-display: [family];
  --font-body: [family];
  --font-mono: [family];
  --text-xs: [size];
  --text-sm: [size];
  --text-base: [size];
  --text-lg: [size];
  --text-xl: [size];
  --text-2xl: [size];
}
```

## Layout & Spacing

- Density: [dense | balanced | sparse]
- Max width: [content width limit, e.g., 1200px]
- Grid: [column system, e.g., 12-column]
- Spacing base: [4px | 8px]

Spacing scale:

```css
:root {
  --space-1: [base * 0.5];
  --space-2: [base * 1];
  --space-3: [base * 2];
  --space-4: [base * 3];
  --space-5: [base * 4];
  --space-6: [base * 6];
}
```

## Motion

- Animation level: [none | subtle | moderate | rich]
- Transition timing: [fast ~100ms | normal ~200ms | slow ~300ms]
- Micro-interactions: [hover states, loading states, focus effects]

Motion guidelines:

- Entrance: [stagger | fade | slide | none]
- Exit: [fade | slide | none]
- Hover: [scale | color shift | underline | shadow]
- Loading: [spinner | skeleton | progress bar]

## Visual Details

- Border radius: [sharp 0px | soft 4-8px | round 12px+]
- Shadow level: [none | subtle | moderate | strong]
- Icon style: [outline | solid | minimal | custom]
- Illustration style: [none | abstract | realistic | brand-specific]

## Component Patterns

### Buttons

| Variant | Style |
|---------|-------|
| Primary | [background, text, radius, shadow] |
| Secondary | [background, text, radius] |
| Ghost | [no background, text only] |
| Destructive | [error color variant] |

### Cards

- Border: [none | visible | shadow-only]
- Padding: [spacing value]
- Radius: [border radius]
- Shadow: [shadow level]

### Inputs

- Border: [width, color]
- Focus: [ring color, ring width]
- Error: [border color, icon]
- Radius: [border radius]

### Navigation

- Style: [sidebar | topbar | tabs | mix]
- Active state: [background change | border | indicator]
- Collapsed: [icon-only | hidden | responsive]

## Best For

- Ideal use cases:
  - [when this design works best]
  - [suitable product types]
  - [appropriate audience]

- Avoid:
  - [when not to use this direction]
  - [mismatched product types]

## Design Decisions Log

Record design decisions that outlive individual changes:

- [YYYY-MM-DD] [change-id]: [decision made] — [reasoning]
- [YYYY-MM-DD] [change-id]: [decision made] — [reasoning]

---

## Quick Tone Reference

When choosing a visual tone, consider:

| Tone | Best For | Key Brands |
|------|----------|------------|
| Minimal Clean | Tools, dashboards, productivity | Linear, Vercel, Raycast |
| Editorial Warm | Content, docs, blogs | Notion, Medium, Mintlify |
| Dark Cinematic | Media, AI tools, dev tools | ElevenLabs, Cursor, RunwayML |
| Developer-First | Terminal, CLI, APIs | Ollama, Warp, Supabase |
| Friendly Playful | Consumer apps, SaaS | Lovable, Zapier, Cal.com |
| Enterprise Clean | B2B, infrastructure | HashiCorp, MongoDB, ClickHouse |
| Luxury Refined | Premium products | Apple, Figma, Linear (pro) |