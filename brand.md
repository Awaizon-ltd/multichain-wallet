# Brand — Rizon

_Status: active_

**Rizon** is a self-custody crypto wallet by Awarizon, for Android and desktop browsers (Chrome extension). One recovery phrase gives the same wallet on Ethereum, Base, Arc, Robinhood Chain, Solana and more.

Live kit: https://rizon.awarizon.com/brand

## Palette

Dark-first. Ink backgrounds, light text, and Rizon Lime used sparingly for the one thing that matters on each screen.

### Brand

| Token | Name | Hex | OKLCH | Use |
|---|---|---|---|---|
| `--rizon-lime` | Rizon Lime | `#d6fa1b` | `oklch(0.927 0.215 119.8)` | The brand colour. Primary buttons, active states, highlights, the logo. |
| `--rizon-ink` | Ink | `#0a0a0a` | `oklch(0.145 0.000 0)` | Page background, and text or icons on Lime. |

### Lime ramp

| Token | Name | Hex | OKLCH | Use |
|---|---|---|---|---|
| `--rizon-lime-light` | Lime Light | `#e7fc70` | `oklch(0.949 0.165 116.8)` | Hover state of Lime buttons. |
| `--rizon-lime-deep` | Lime Deep | `#a8c700` | `oklch(0.779 0.186 120.3)` | Pressed state; Lime on lighter tints. |
| `--rizon-lime-ink` | Lime on Light | `#5f7300` | `oklch(0.520 0.125 120.9)` | Lime text or links on white or light backgrounds. |
| `--rizon-lime-muted` | Lime Muted | `#242b00` | `oklch(0.273 0.064 118.8)` | Tinted backgrounds behind Lime badges and chips. |

### Surfaces

| Token | Name | Hex | OKLCH | Use |
|---|---|---|---|---|
| `--rizon-charcoal` | Charcoal | `#121212` | `oklch(0.182 0.000 0)` | Section backgrounds, alternating with Ink. |
| `--rizon-surface` | Surface | `#1a1a1a` | `oklch(0.218 0.000 0)` | Inputs, list rows. |
| `--rizon-card` | Card | `#1e1e1e` | `oklch(0.235 0.000 0)` | Cards and sheets. |
| `--rizon-elevated` | Elevated | `#282828` | `oklch(0.277 0.000 0)` | Menus, popovers, hovered rows. |
| `--rizon-border` | Border | `#2c2c2c` | `oklch(0.293 0.000 0)` | Hairlines and dividers. |

### Text

| Token | Name | Hex | OKLCH | Use |
|---|---|---|---|---|
| `--rizon-text` | Text | `#f5f5f5` | `oklch(0.970 0.000 0)` | Headings and body text. |
| `--rizon-text-2` | Text Secondary | `#c2c2c2` | `oklch(0.814 0.000 0)` | Supporting copy. |
| `--rizon-text-3` | Text Tertiary | `#9a9a9a` | `oklch(0.686 0.000 0)` | Captions, labels, metadata. Never below 14px. |

### Status

| Token | Name | Hex | OKLCH | Use |
|---|---|---|---|---|
| `--rizon-success` | Success | `#66bb6a` | `oklch(0.718 0.142 144.9)` | Confirmed transactions, gains. |
| `--rizon-error` | Error | `#ef5350` | `oklch(0.654 0.193 25.1)` | Failures, losses, scam warnings. |
| `--rizon-warning` | Warning | `#ff6d00` | `oklch(0.705 0.199 45.8)` | Risky approvals, unverified sites. |
| `--rizon-info` | Info | `#29b6f6` | `oklch(0.734 0.145 234.6)` | Neutral notices, pending states. |
| `--rizon-teal` | Teal | `#00c2a8` | `oklch(0.729 0.134 178.5)` | Second stop of the brand gradient only. |

### Networks

| Token | Name | Hex | OKLCH | Use |
|---|---|---|---|---|
| `--rizon-eth` | Ethereum | `#627eea` | `oklch(0.625 0.165 270.1)` | Ethereum and EVM network accents. |
| `--rizon-sol-purple` | Solana Purple | `#9945ff` | `oklch(0.598 0.256 298.9)` | Solana accents, first gradient stop. |
| `--rizon-sol-green` | Solana Green | `#14f195` | `oklch(0.844 0.199 156.8)` | Solana accents, second gradient stop. |

## Contrast check

| Foreground | Background | Ratio | WCAG | Used for |
|---|---|---|---|---|
| Text | Ink | 18.16:1 | AAA | Body text on the page |
| Text Secondary | Ink | 11.11:1 | AAA | Supporting copy |
| Text Tertiary | Ink | 7.04:1 | AAA | Captions and labels |
| Text Tertiary | Card | 5.92:1 | AA | Captions inside cards |
| Ink | Rizon Lime | 16.54:1 | AAA | Primary button label |
| Rizon Lime | Card | 13.93:1 | AAA | Lime text and icons on cards |
| Rizon Lime | Ink | 16.54:1 | AAA | Lime text on the page |
| Success | Ink | 8.37:1 | AAA | Gains |
| Error | Ink | 5.68:1 | AA | Losses and warnings |
| Lime on Light | White | 5.33:1 | AA | Lime text on white (light contexts) |
| Rizon Lime | White | 1.20:1 | Fail | Lime on white |

Lime on white fails. On light backgrounds use **Lime on Light** (`#5f7300`) for text, or put the logo on its black tile.

## Typography

- **Inter** (400, 500, 600, 700, 800) for everything: UI, headings, body.
- **JetBrains Mono** (500) for addresses, hashes and aligned numbers.
- Both are free on Google Fonts.

### Type scale

| Style | Font | Weight | Size | Line height | Tracking |
|---|---|---|---|---|---|
| Display | Inter | 800 | `clamp(48px, 7.2vw, 96px)` | 0.98 | -0.045em |
| Heading 2 | Inter | 800 | `clamp(34px, 4.4vw, 56px)` | 1.05 | -0.035em |
| Heading 3 | Inter | 700 | `20px` | 1.3 | -0.01em |
| Lede | Inter | 400 | `20px` | 1.6 | 0 |
| Body | Inter | 400 | `16px` | 1.6 | 0 |
| Small | Inter | 500 | `14px` | 1.5 | 0 |
| Kicker | Inter | 700 | `13px` | 1.4 | 0.08em |
| Mono | JetBrains Mono | 500 | `14px` | 1.5 | 0 |

## Gradients

| Name | CSS | Use |
|---|---|---|
| Brand | `linear-gradient(135deg, #d6fa1b 0%, #00c2a8 100%)` | Hero moments, the download section, promo art. |
| Ethereum glass | `linear-gradient(135deg, #627eea 0%, #29b6f6 100%)` | Cards about Ethereum and EVM networks. |
| Solana glass | `linear-gradient(135deg, #9945ff 0%, #14f195 100%)` | Cards about Solana. |
| Lime glow | `radial-gradient(60% 60% at 50% 0%, rgba(214,250,27,0.28) 0%, rgba(10,10,10,0) 100%), #0a0a0a` | Background glow behind hero content. |

## Logo

- **Clear space:** keep space equal to half the mark's height on every side.
- **Minimum size:** mark 24px; lockup 96px wide.
- On dark backgrounds use the transparent mark. On light or busy backgrounds use the app icon (black tile).
- Don't recolour, outline, stretch, rotate, add shadows or effects, or place the transparent Lime mark on white.

Files: `rizon-mark.png`, `rizon-app-icon-1024.png`, `rizon-lockup-on-dark.png`, `rizon-lockup-on-light.png`, `rizon-lockup-on-lime.png`

## Tone and voice

**Clear before clever.** Rizon moves people's money, so every word must be unambiguous. Say what will happen ("You'll receive at least 1,280 USDC"), not how exciting it is.

**Calm and direct.** Short sentences, active voice, plain English. Explain risk without fear: "This site is asking for unlimited access to your USDC" rather than "DANGER!".

**Honest about self-custody.** We never promise what we can't deliver. No "unhackable", "100% safe" or "guaranteed". We say plainly that nobody, including Awarizon, can recover a lost phrase.

## Do's and don'ts

| Do | Don't |
|---|---|
| Use Lime for one primary action per view | Fill large areas with Lime behind body text, except intentional Lime sections with Ink text |
| Put Ink text on Lime | Put white text on Lime (1.1:1) |
| Use Lime on Light (`#5f7300`) for Lime text on white | Put Lime on white (1.2:1) |
| Use JetBrains Mono for addresses and amounts | Use mono for headings or body copy |
| Use network colours only for network-specific content | Use ETH blue or Solana purple as general accents |
| Say "Approve", "Swap", "Send" | Say "Click here", "Submit", "OK" |
