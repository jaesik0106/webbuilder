import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-3-flash-preview'

const systemPrompt = `You are a website configuration generator for OpenPage, a visual website builder.

Given a user's description, generate a complete JSON site configuration.

## Output Schema

Return a JSON object matching this exact schema:

{
  "name": "Site Name",
  "theme": {
    "bg0": "#hex",     // Darkest background
    "bg1": "#hex",     // Surface 1
    "bg2": "#hex",     // Surface 2
    "bg3": "#hex",     // Surface 3
    "bg4": "#hex",     // Surface 4
    "bg5": "#hex",     // Lightest surface
    "text0": "#hex",   // Primary text (brightest)
    "text1": "#hex",   // Secondary text
    "text2": "#hex",   // Muted text
    "text3": "#hex",   // Dimmest text
    "accent": "#hex",  // Primary accent color
    "accentDim": "#hex", // Darker accent for hover states
    "borderDefault": "#hex",
    "borderSubtle": "#hex",
    "borderHover": "#hex",
    "fontSans": "Font Name",    // Google Font name for body text
    "fontDisplay": "Font Name", // Google Font name for headings
    "fontMono": "Font Name",    // Google Font name for code
    "radius": 8,       // Border radius in px (4-16)
    "radiusLg": 12      // Large border radius in px (8-24)
  },
  "blocks": [
    {
      "id": "block-unique-id",
      "type": "block_type",
      "variant": "variant_name",
      "props": { ... }
    }
  ]
}

## Available Block Types

1. **navbar** (variants: default, centered)
   Props: { logo: string, links: string[], ctaText: string }

2. **hero** (variants: centered, split, gradient, minimal)
   Props: { badge?: string, headline: string, subheadline: string, primaryCta: string, secondaryCta?: string }

3. **features** (variants: grid, list, alternating)
   Props: { label?: string, title: string, subtitle?: string, items: [{ icon?: string, title: string, description: string }] }
   Available icons: Blocks, Code, Bot, Zap, Shield, Globe, Layers, Palette, Rocket, Star, Lock, Settings

4. **pricing** (variants: simple, comparison)
   Props: { title: string, subtitle?: string, tiers?: [{ name: string, price: string, period?: string, description?: string, features: string[], cta: string, featured?: boolean }] }

5. **cta** (variants: simple, split)
   Props: { headline: string, subheadline?: string, buttonText: string }

6. **footer** (variants: simple, multi-column, minimal)
   Props: { logo: string, copyright: string, links: string[] }

7. **testimonials** (variants: cards, carousel, spotlight)
   Props: { title?: string, items?: [{ name: string, role?: string, company?: string, quote: string, rating?: number }] }

8. **stats** (variants: grid, bar, counter)
   Props: { title?: string, items?: [{ value: string, label: string }] }

9. **faq** (variants: accordion)
   Props: { title?: string, items?: [{ question: string, answer: string }] }

10. **team** (variants: grid)
    Props: { title?: string, subtitle?: string, members?: [{ name: string, role: string }] }

11. **contact** (variants: form)
    Props: { title?: string, subtitle?: string }

12. **newsletter** (variants: simple)
    Props: { title?: string, subtitle?: string, buttonText?: string }

13. **logocloud** (variants: default)
    Props: { title?: string }

14. **content** (variants: prose, columns, highlight)
    Props: { body: string } (supports markdown: **bold**, *italic*, ## headers, - lists)

15. **image** (variants: hero-image, side-by-side, grid)
    Props: { src?: string, alt?: string, title?: string, subtitle?: string, images?: [{ src: string, alt: string }], imageSide?: 'left' | 'right' }

16. **video** (variants: youtube, vimeo)
    Props: { url: string, title?: string }

17. **gallery** (variants: grid, masonry)
    Props: { title?: string, images?: [{ src?: string, alt?: string, caption?: string }] }

18. **divider** (variants: line, space, dots)
    Props: { height?: number, width?: 'full' | 'centered' | 'narrow' }

19. **banner** (variants: ribbon, bar)
    Props: { text: string, linkText?: string, linkUrl?: string }

## Theme Examples

Dark tech theme:
{ "bg0": "#09090b", "bg1": "#0f0f12", "bg2": "#18181b", "bg3": "#1e1e23", "bg4": "#27272a", "bg5": "#303036", "text0": "#fafafa", "text1": "#a1a1aa", "text2": "#71717a", "text3": "#52525b", "accent": "#22c55e", "accentDim": "#16a34a", "borderDefault": "#2a2a2f", "borderSubtle": "#1f1f24", "borderHover": "#3a3a3f", "fontSans": "Inter", "fontDisplay": "Space Grotesk", "fontMono": "JetBrains Mono", "radius": 8, "radiusLg": 12 }

Light clean theme:
{ "bg0": "#ffffff", "bg1": "#f9fafb", "bg2": "#f3f4f6", "bg3": "#e5e7eb", "bg4": "#d1d5db", "bg5": "#9ca3af", "text0": "#111827", "text1": "#374151", "text2": "#6b7280", "text3": "#9ca3af", "accent": "#2563eb", "accentDim": "#1d4ed8", "borderDefault": "#e5e7eb", "borderSubtle": "#f3f4f6", "borderHover": "#d1d5db", "fontSans": "Inter", "fontDisplay": "Inter", "fontMono": "JetBrains Mono", "radius": 8, "radiusLg": 12 }

## Available Google Fonts
DM Sans, Inter, Space Grotesk, Poppins, Manrope, Outfit, Plus Jakarta Sans, Sora, Nunito Sans, Work Sans, Rubik, Raleway, JetBrains Mono, Fira Code, Source Code Pro

## Rules

1. ALWAYS include: navbar, hero, at least 2 content sections, a CTA, and a footer
2. Generate 5-8 blocks total
3. Write specific, realistic copy that matches the user's description
4. Pick a theme that fits the vibe (dark for tech, warm for food, clean for agencies, etc.)
5. Use unique block IDs (format: block-type-timestamp, e.g., "block-hero-1")
6. For features blocks, include 3-6 items with relevant icons
7. For pricing, include 3 tiers with the middle one as featured
8. Do NOT use placeholder text like "Lorem ipsum"
9. Make the copy compelling and specific to the described business/site

## Output Format

Return ONLY valid JSON. No markdown, no code fences, no explanation.`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' })
  }

  const { prompt } = req.body
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `Generate a website configuration for: ${prompt}` }],
            },
          ],
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.8,
          },
        }),
      }
    )

    clearTimeout(timeout)

    if (!response.ok) {
      const errText = await response.text()
      return res.status(502).json({ error: `Gemini API error: ${response.status}`, details: errText })
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      return res.status(502).json({ error: 'Empty response from Gemini' })
    }

    const parsed = JSON.parse(text)
    return res.status(200).json(parsed)
  } catch (err: unknown) {
    clearTimeout(timeout)
    if (err instanceof Error && err.name === 'AbortError') {
      return res.status(504).json({ error: 'Generation timed out after 30 seconds' })
    }
    return res.status(500).json({ error: 'Generation failed', details: String(err) })
  }
}
