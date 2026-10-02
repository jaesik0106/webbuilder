# OpenPage

## What This Is

A visual website builder where **JSON config is the source of truth**. Both humans (via visual editor) and AI agents (via JSON patches) can build websites. React app with 13 production-quality block components.

## Tech Stack

- **Vite + React 19 + TypeScript**
- **Tailwind CSS v4** + shadcn/ui patterns
- **Zustand + immer** for state management
- **React Router v7** for routing
- **@dnd-kit** for drag-and-drop
- **sonner** for toasts, **lucide-react** for icons

## Project Structure

```
src/
  routes/        PublicHome (/ and /page/:id), Login, Dashboard (+ PagesScreen, AiHistoryScreen), Settings, Deploy, NotFound
  layout/        AppLayout, AdminSidebar (+ AdminTopBar), ErrorBoundary
  editor/        OnPageEditor (on-page editing toolbar, inline text edit, add/move/delete sections),
                 RightSidebar, PropertiesPanel, DesignPanel, ReviseBar (AI edits), inlineText, useAutoSaveToProject
  blocks/        registry.tsx, types.ts
    hero/        HeroCentered, HeroSplit, HeroGradient
    features/    FeaturesGrid, FeaturesList
    pricing/     PricingSimple, PricingComparison
    cta/         CtaSimple, CtaSplit
    footer/      FooterSimple, FooterMultiColumn, FooterMinimal
    navbar/      NavbarDefault
    testimonials/ TestimonialsCards, TestimonialsCarousel
    stats/       StatsGrid, StatsBar
    faq/         FaqAccordion
    team/        TeamGrid
    contact/     ContactForm
    newsletter/  NewsletterSimple
    logocloud/   LogoCloudDefault
  store/         configStore (site JSON + undo/redo), editorStore (UI state), projectsStore (projects + localStorage)
  lib/           utils, block-metadata, useKeyboardShortcuts
```

## Key Architecture

- **configStore**: Zustand + immer. Holds site JSON config and full undo/redo stack.
- **Block Registry**: Maps block type string to React component. `renderBlock(config)` resolves and renders.
- **On-page editing**: the separate /editor screen was removed (2026-10-01). Admins edit on the real page (/ or /page/:id) with the OnPageEditor toolbar.
- **Sidebar editing**: Right sidebar has dynamic property inputs per block type. Changes update store, canvas re-renders.

## Commands

```bash
npm run dev      # Start dev server
npm run build    # TypeScript check + Vite build
npm run preview  # Preview production build
```

## Design Tokens

All from wireframes.html:
- Backgrounds: bg-0 (#09090b) through bg-5 (#303036)
- Green accent: #22c55e (--color-green)
- Fonts: DM Sans (body), JetBrains Mono (code), Space Grotesk (display)

## Conventions

- On-page editing chrome (toolbar, panels, selection, element bars): same light 10PAGE tone as admin (white panels, blue #1c54e4, Pretendard) via .admin-light; on-canvas outlines and bars use hard-coded #1c54e4 because they sit inside the site theme variables
- Admin screens (dashboard, pages, settings, login): match the existing 10PAGE admin, white background, blue (#1c54e4) accent, Pretendard font, applied via the .admin-light token override in src/index.css
- All blocks are Tailwind-only, no external CSS
- Block components receive `{ block: BlockConfig }` as props
- Use `@/` import alias for all src/ imports
