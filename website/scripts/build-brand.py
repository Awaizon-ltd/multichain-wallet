"""Builds the Rizon brand kit from one source of truth (the PALETTE below).

Writes:
  brand/index.html              the /brand page (built by Vite like any other page)
  public/brand/colors.css       CSS custom properties
  public/brand/tokens.json      design tokens (hex, rgb, oklch)
  public/brand/brand.md         the written guidelines (also copied to ../brand.md)
  public/brand/rizon-brand-kit.zip   logos + the three files above

Run from website/:  python scripts/build-brand.py
Logo PNGs in public/brand/ must already exist (see README).
"""
import html, json, math, os, zipfile

SITE = "https://rizon.awarizon.com"

# ----------------------------------------------------------------------------- palette
# (group, [(token, name, hex, usage)])
PALETTE = [
    ("Brand", [
        ("lime", "Rizon Lime", "#d6fa1b", "The brand colour. Primary buttons, active states, highlights, the logo."),
        ("ink", "Ink", "#0a0a0a", "Page background, and text or icons on Lime."),
    ]),
    ("Lime ramp", [
        ("lime-light", "Lime Light", "#e7fc70", "Hover state of Lime buttons."),
        ("lime-deep", "Lime Deep", "#a8c700", "Pressed state; Lime on lighter tints."),
        ("lime-ink", "Lime on Light", "#5f7300", "Lime text or links on white or light backgrounds."),
        ("lime-muted", "Lime Muted", "#242b00", "Tinted backgrounds behind Lime badges and chips."),
    ]),
    ("Surfaces", [
        ("charcoal", "Charcoal", "#121212", "Section backgrounds, alternating with Ink."),
        ("surface", "Surface", "#1a1a1a", "Inputs, list rows."),
        ("card", "Card", "#1e1e1e", "Cards and sheets."),
        ("elevated", "Elevated", "#282828", "Menus, popovers, hovered rows."),
        ("border", "Border", "#2c2c2c", "Hairlines and dividers."),
    ]),
    ("Text", [
        ("text", "Text", "#f5f5f5", "Headings and body text."),
        ("text-2", "Text Secondary", "#c2c2c2", "Supporting copy."),
        ("text-3", "Text Tertiary", "#9a9a9a", "Captions, labels, metadata. Never below 14px."),
    ]),
    ("Status", [
        ("success", "Success", "#66bb6a", "Confirmed transactions, gains."),
        ("error", "Error", "#ef5350", "Failures, losses, scam warnings."),
        ("warning", "Warning", "#ff6d00", "Risky approvals, unverified sites."),
        ("info", "Info", "#29b6f6", "Neutral notices, pending states."),
        ("teal", "Teal", "#00c2a8", "Second stop of the brand gradient only."),
    ]),
    ("Networks", [
        ("eth", "Ethereum", "#627eea", "Ethereum and EVM network accents."),
        ("sol-purple", "Solana Purple", "#9945ff", "Solana accents, first gradient stop."),
        ("sol-green", "Solana Green", "#14f195", "Solana accents, second gradient stop."),
    ]),
]
HEX = {tok: hx for _, items in PALETTE for tok, _, hx, _ in items}

# Foreground / background pairs we actually use, plus the one we forbid.
PAIRS = [
    ("text", "ink", "Body text on the page"),
    ("text-2", "ink", "Supporting copy"),
    ("text-3", "ink", "Captions and labels"),
    ("text-3", "card", "Captions inside cards"),
    ("ink", "lime", "Primary button label"),
    ("lime", "card", "Lime text and icons on cards"),
    ("lime", "ink", "Lime text on the page"),
    ("success", "ink", "Gains"),
    ("error", "ink", "Losses and warnings"),
    ("lime-ink", "#ffffff", "Lime text on white (light contexts)"),
    ("lime", "#ffffff", "Lime on white"),
]

GRADIENTS = [
    ("brand", "Brand", "linear-gradient(135deg, #d6fa1b 0%, #00c2a8 100%)", "Hero moments, the download section, promo art."),
    ("eth", "Ethereum glass", "linear-gradient(135deg, #627eea 0%, #29b6f6 100%)", "Cards about Ethereum and EVM networks."),
    ("sol", "Solana glass", "linear-gradient(135deg, #9945ff 0%, #14f195 100%)", "Cards about Solana."),
    ("glow", "Lime glow", "radial-gradient(60% 60% at 50% 0%, rgba(214,250,27,0.28) 0%, rgba(10,10,10,0) 100%), #0a0a0a", "Background glow behind hero content."),
]

TYPE_SCALE = [
    ("Display", "Inter", 800, "clamp(48px, 7.2vw, 96px)", "0.98", "-0.045em", "Your keys. Every chain."),
    ("Heading 2", "Inter", 800, "clamp(34px, 4.4vw, 56px)", "1.05", "-0.035em", "Swap and bridge in a click"),
    ("Heading 3", "Inter", 700, "20px", "1.3", "-0.01em", "Scam protection built in"),
    ("Lede", "Inter", 400, "20px", "1.6", "0", "One recovery phrase. The same wallet on your phone and in your browser."),
    ("Body", "Inter", 400, "16px", "1.6", "0", "Every connection, signature and transaction waits for your approval."),
    ("Small", "Inter", 500, "14px", "1.5", "0", "Network fee · ≈ $0.04"),
    ("Kicker", "Inter", 700, "13px", "1.4", "0.08em", "SELF-CUSTODY"),
    ("Mono", "JetBrains Mono", 500, "14px", "1.5", "0", "0x7a3F…c91E  ·  1,284.50 USDC"),
]

LOGOS = [
    ("rizon-mark.png", "Mark", "Transparent, 1024 × 1024. For dark backgrounds.", "mark"),
    ("rizon-app-icon-1024.png", "App icon", "Black tile, 1024 × 1024. Use on any background.", "icon"),
    ("rizon-lockup-on-dark.png", "Lockup, dark", "Transparent, 1200 × 360. Light wordmark for dark backgrounds.", "dark"),
    ("rizon-lockup-on-light.png", "Lockup, light", "Transparent, 1200 × 360. Ink wordmark for white or light backgrounds.", "light"),
    ("rizon-lockup-on-lime.png", "Lockup, Lime", "Lime background, 1200 × 360. For Lime-on-brand moments.", "lime"),
]

# ----------------------------------------------------------------------------- colour maths
def rgb(hx):
    hx = hx.lstrip("#")
    return tuple(int(hx[i : i + 2], 16) for i in (0, 2, 4))

def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lum(hx):
    r, g, b = (lin(c) for c in rgb(hx))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

def oklch(hx):
    r, g, b = (lin(c) for c in rgb(hx))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (math.copysign(abs(x) ** (1 / 3), x) for x in (l, m, s))
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    C = math.hypot(A, B)
    H = math.degrees(math.atan2(B, A)) % 360
    return f"oklch({L:.3f} {C:.3f} {0 if C < 0.002 else round(H, 1)})"

def resolve(x):
    return HEX.get(x, x)

def name_of(x):
    for _, items in PALETTE:
        for tok, nm, _, _ in items:
            if tok == x:
                return nm
    return "White" if x == "#ffffff" else x

def grade(r):
    if r >= 7: return "AAA", "pass"
    if r >= 4.5: return "AA", "pass"
    if r >= 3: return "AA Large", "warn"
    return "Fail", "fail"

# ----------------------------------------------------------------------------- outputs
os.makedirs("public/brand", exist_ok=True)
os.makedirs("brand", exist_ok=True)
e = html.escape

# colors.css
css = ["/* Rizon brand colours — " + SITE + "/brand */", ":root {"]
for group, items in PALETTE:
    css.append(f"  /* {group} */")
    for tok, nm, hx, _ in items:
        css.append(f"  --rizon-{tok}: {hx}; /* {oklch(hx)} */")
for tok, nm, val, _ in GRADIENTS:
    css.append(f"  --rizon-gradient-{tok}: {val};")
css.append('  --rizon-font-sans: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;')
css.append('  --rizon-font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;')
css.append("  --rizon-radius: 24px;\n  --rizon-radius-sm: 14px;\n  --rizon-radius-pill: 999px;\n}")
open("public/brand/colors.css", "w", encoding="utf-8").write("\n".join(css) + "\n")

# tokens.json
tokens = {
    "color": {tok: {"name": nm, "hex": hx, "rgb": "rgb(%d %d %d)" % rgb(hx), "oklch": oklch(hx), "usage": use}
              for _, items in PALETTE for tok, nm, hx, use in items},
    "gradient": {tok: {"name": nm, "css": val, "usage": use} for tok, nm, val, use in GRADIENTS},
    "font": {"sans": "Inter", "mono": "JetBrains Mono"},
    "typeScale": {n.lower().replace(" ", "-"): {"family": f, "weight": w, "size": s, "lineHeight": lh, "letterSpacing": ls}
                  for n, f, w, s, lh, ls, _ in TYPE_SCALE},
    "radius": {"card": "24px", "control": "14px", "pill": "999px"},
}
open("public/brand/tokens.json", "w", encoding="utf-8").write(json.dumps(tokens, indent=2, ensure_ascii=False) + "\n")

# brand.md
md = [f"# Brand — Rizon", "", "_Status: active_", "",
      "**Rizon** is a self-custody crypto wallet by Awarizon, for Android and desktop browsers (Chrome extension). One recovery phrase gives the same wallet on Ethereum, Base, Arc, Robinhood Chain, Solana and more.", "",
      f"Live kit: {SITE}/brand", "",
      "## Palette", "", "Dark-first. Ink backgrounds, light text, and Rizon Lime used sparingly for the one thing that matters on each screen.", ""]
for group, items in PALETTE:
    md += [f"### {group}", "", "| Token | Name | Hex | OKLCH | Use |", "|---|---|---|---|---|"]
    md += [f"| `--rizon-{tok}` | {nm} | `{hx}` | `{oklch(hx)}` | {use} |" for tok, nm, hx, use in items]
    md.append("")
md += ["## Contrast check", "", "| Foreground | Background | Ratio | WCAG | Used for |", "|---|---|---|---|---|"]
for fg, bg, use in PAIRS:
    r = contrast(resolve(fg), resolve(bg))
    md.append(f"| {name_of(fg)} | {name_of(bg)} | {r:.2f}:1 | {grade(r)[0]} | {use} |")
md += ["", "Lime on white fails. On light backgrounds use **Lime on Light** (`#5f7300`) for text, or put the logo on its black tile.", "",
       "## Typography", "",
       "- **Inter** (400, 500, 600, 700, 800) for everything: UI, headings, body.",
       "- **JetBrains Mono** (500) for addresses, hashes and aligned numbers.",
       "- Both are free on Google Fonts.", "",
       "### Type scale", "", "| Style | Font | Weight | Size | Line height | Tracking |", "|---|---|---|---|---|---|"]
md += [f"| {n} | {f} | {w} | `{s}` | {lh} | {ls} |" for n, f, w, s, lh, ls, _ in TYPE_SCALE]
md += ["", "## Gradients", "", "| Name | CSS | Use |", "|---|---|---|"]
md += [f"| {nm} | `{val}` | {use} |" for _, nm, val, use in GRADIENTS]
md += ["", "## Logo", "",
       "- **Clear space:** keep space equal to half the mark's height on every side.",
       "- **Minimum size:** mark 24px; lockup 96px wide.",
       "- On dark backgrounds use the transparent mark. On light or busy backgrounds use the app icon (black tile).",
       "- Don't recolour, outline, stretch, rotate, add shadows or effects, or place the transparent Lime mark on white.", "",
       "Files: " + ", ".join(f"`{f}`" for f, *_ in LOGOS), "",
       "## Tone and voice", "",
       "**Clear before clever.** Rizon moves people's money, so every word must be unambiguous. Say what will happen (\"You'll receive at least 1,280 USDC\"), not how exciting it is.", "",
       "**Calm and direct.** Short sentences, active voice, plain English. Explain risk without fear: \"This site is asking for unlimited access to your USDC\" rather than \"DANGER!\".", "",
       "**Honest about self-custody.** We never promise what we can't deliver. No \"unhackable\", \"100% safe\" or \"guaranteed\". We say plainly that nobody, including Awarizon, can recover a lost phrase.", "",
       "## Do's and don'ts", "",
       "| Do | Don't |", "|---|---|",
       "| Use Lime for one primary action per view | Fill large areas with Lime behind body text, except intentional Lime sections with Ink text |",
       "| Put Ink text on Lime | Put white text on Lime (1.1:1) |",
       "| Use Lime on Light (`#5f7300`) for Lime text on white | Put Lime on white (1.2:1) |",
       "| Use JetBrains Mono for addresses and amounts | Use mono for headings or body copy |",
       "| Use network colours only for network-specific content | Use ETH blue or Solana purple as general accents |",
       "| Say \"Approve\", \"Swap\", \"Send\" | Say \"Click here\", \"Submit\", \"OK\" |", ""]
md_text = "\n".join(md)
open("public/brand/brand.md", "w", encoding="utf-8").write(md_text)
open("../brand.md", "w", encoding="utf-8").write(md_text)

# ----------------------------------------------------------------------------- page
def swatch(tok, nm, hx, use):
    r, g, b = rgb(hx)
    on = "#0a0a0a" if contrast(hx, "#0a0a0a") > contrast(hx, "#f5f5f5") else "#f5f5f5"
    rows = "".join(
        f'<li><span>{k}</span><button type="button" class="copy" data-copy="{e(v)}" aria-label="Copy {e(nm)} {k}: {e(v)}">{e(v)}</button></li>'
        for k, v in (("HEX", hx.upper()), ("RGB", f"rgb({r} {g} {b})"), ("OKLCH", oklch(hx)), ("CSS", f"var(--rizon-{tok})")))
    return (f'<article class="swatch"><div class="chip" style="background:{hx};color:{on}"><span>{e(nm)}</span>'
            f'<span class="chip-ratio">{contrast(hx, on):.1f}:1</span></div>'
            f'<div class="swatch-body"><p class="swatch-use">{e(use)}</p><ul class="codes">{rows}</ul></div></article>')

colour_sections = "".join(
    f'<h3 class="group-title">{e(group)}</h3><div class="swatches{" swatches-lg" if group == "Brand" else ""}">'
    + "".join(swatch(*it) for it in items) + "</div>"
    for group, items in PALETTE)

contrast_rows = ""
for fg, bg, use in PAIRS:
    f, b = resolve(fg), resolve(bg)
    r = contrast(f, b)
    label, cls = grade(r)
    contrast_rows += (f'<tr><td><span class="pair" style="background:{b};color:{f}">Aa</span></td>'
                      f'<td>{e(name_of(fg))} <span class="muted">on</span> {e(name_of(bg))}</td>'
                      f'<td class="mono">{r:.2f}:1</td><td><span class="badge badge-{cls}">{label}</span></td><td class="muted">{e(use)}</td></tr>')

type_rows = "".join(
    f'<div class="type-row"><div class="type-meta"><strong>{e(n)}</strong><span class="mono">{e(f)} {w} · {e(s.replace("clamp(", "").replace(")", "").split(",")[-1].strip() if "clamp" in s else s)} / {lh}</span></div>'
    f'<p class="type-sample" style="font-family:{"&quot;JetBrains Mono&quot;, monospace" if f == "JetBrains Mono" else "Inter, sans-serif"};font-weight:{w};font-size:{s.replace("7.2vw", "5vw").replace("4.4vw", "3.4vw") if "clamp" in s else s};line-height:{lh};letter-spacing:{ls}{";text-transform:uppercase" if n == "Kicker" else ""}">{e(t)}</p></div>'
    for n, f, w, s, lh, ls, t in TYPE_SCALE)

gradient_cards = "".join(
    f'<article class="grad"><div class="grad-fill" style="background:{val}"></div><div class="grad-body"><h3>{e(nm)}</h3><p class="muted small">{e(use)}</p>'
    f'<button type="button" class="copy copy-block" data-copy="{e(val)}" aria-label="Copy {e(nm)} gradient CSS">{e(val)}</button></div></article>'
    for _, nm, val, use in GRADIENTS)

logo_cards = "".join(
    f'<article class="logo-card"><div class="logo-stage logo-{bgc}"><img src="/brand/{f}" alt="Rizon {e(nm.lower())}" loading="lazy" /></div>'
    f'<div class="logo-body"><div><h3>{e(nm)}</h3><p class="muted small">{e(desc)}</p></div>'
    f'<a class="btn btn-ghost btn-sm" href="/brand/{f}" download>PNG</a></div></article>'
    for f, nm, desc, bgc in LOGOS)

DONTS = [
    ("Don't recolour", "filter:hue-rotate(160deg)"),
    ("Don't stretch", "transform:scaleX(1.45)"),
    ("Don't add effects", "filter:drop-shadow(6px 8px 0 #ef5350)"),
    ("Don't rotate", "transform:rotate(-18deg)"),
]
misuse = "".join(
    f'<figure class="misuse"><div class="misuse-stage"><img src="/brand/rizon-mark.png" alt="" loading="lazy" style="{st}" /></div><figcaption>{e(t)}</figcaption></figure>'
    for t, st in DONTS) + ('<figure class="misuse"><div class="misuse-stage" style="background:#fff"><img src="/brand/rizon-mark.png" alt="" loading="lazy" /></div>'
                           '<figcaption>Don\'t put the transparent mark on white</figcaption></figure>')

page = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Brand Kit — Rizon Wallet</title>
    <meta name="description" content="Rizon logos, colours, typography, gradients and voice. Download the brand kit." />
    <meta name="theme-color" content="#0a0a0a" />
    <link rel="canonical" href="{SITE}/brand" />
    <meta property="og:title" content="Rizon Brand Kit" />
    <meta property="og:description" content="Logos, colours, typography, gradients and voice for Rizon Wallet." />
    <meta property="og:image" content="{SITE}/og.png" />
    <meta property="og:url" content="{SITE}/brand" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
  </head>
  <body class="doc-page brand-page">
    <a class="skip" href="#main">Skip to content</a>
    <header class="nav scrolled">
      <div class="nav-shell">
        <a class="brand" href="/" aria-label="Rizon home"><img src="/icon.png" alt="" width="32" height="32" /><span>Rizon</span></a>
        <a class="btn btn-primary btn-sm" href="/brand/rizon-brand-kit.zip" download style="margin-left: auto">Download kit</a>
      </div>
    </header>

    <main id="main">
      <section class="brand-hero">
        <div class="container">
          <p class="kicker"><span class="dot"></span>Brand kit</p>
          <h1>Rizon, <span class="accent">on brand.</span></h1>
          <p class="lede">Logos, colours, type and voice for Rizon Wallet. Everything here is free to use when you write about, integrate or promote Rizon.</p>
          <div class="cta-row">
            <a class="btn btn-primary" href="/brand/rizon-brand-kit.zip" download>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" /></svg>Download brand kit (.zip)
            </a>
            <a class="btn btn-ghost" href="/brand/brand.md" download>Guidelines (.md)</a>
          </div>
          <ul class="kit-files small muted">
            <li>5 logo PNGs</li><li>colors.css</li><li>tokens.json</li><li>brand.md</li>
          </ul>
        </div>
      </section>

      <section id="logo" class="brand-section">
        <div class="container">
          <header class="section-head"><p class="kicker">01 · Logo</p><h2>The mark</h2>
            <p class="lede">An R that folds into a wallet. Use the transparent mark on dark backgrounds and the black app icon everywhere else.</p></header>
          <div class="logo-grid">{logo_cards}</div>
          <div class="rules">
            <article class="card rule">
              <h3>Clear space</h3>
              <div class="clearspace" aria-hidden="true"><div class="cs-box"><img src="/brand/rizon-app-icon-512.png" alt="" /></div></div>
              <p class="muted small">Keep space equal to half the mark's height on every side. Nothing else goes inside it.</p>
            </article>
            <article class="card rule">
              <h3>Minimum size</h3>
              <div class="minsize" aria-hidden="true">
                <div><img src="/brand/rizon-app-icon-512.png" alt="" width="24" height="24" /><span class="mono small">24px</span></div>
                <div><img src="/brand/rizon-lockup-on-dark.png" alt="" style="width:96px" /><span class="mono small">96px</span></div>
              </div>
              <p class="muted small">Below this the wallet detail in the R stops reading. Use the app icon for favicons.</p>
            </article>
          </div>
          <h3 class="group-title">Don't</h3>
          <div class="misuse-grid">{misuse}</div>
        </div>
      </section>

      <section id="colour" class="brand-section alt">
        <div class="container">
          <header class="section-head"><p class="kicker">02 · Colour</p><h2>Dark, with one bright idea</h2>
            <p class="lede">Ink backgrounds, light text, and Rizon Lime saved for the one thing that matters on each screen. Click any value to copy it.</p></header>
          {colour_sections}
          <div class="dl-row"><a class="btn btn-ghost btn-sm" href="/brand/colors.css" download>colors.css</a><a class="btn btn-ghost btn-sm" href="/brand/tokens.json" download>tokens.json</a></div>
        </div>
      </section>

      <section id="contrast" class="brand-section">
        <div class="container">
          <header class="section-head"><p class="kicker">Accessibility</p><h2>Contrast that passes</h2>
            <p class="lede">Every pairing we ship meets WCAG AA. Lime on white doesn't, so on light backgrounds use Lime on Light for text.</p></header>
          <div class="table-wrap card"><table class="contrast-table">
            <thead><tr><th scope="col"><span class="sr-only">Sample</span></th><th scope="col">Pairing</th><th scope="col">Ratio</th><th scope="col">WCAG</th><th scope="col">Used for</th></tr></thead>
            <tbody>{contrast_rows}</tbody></table></div>
        </div>
      </section>

      <section id="type" class="brand-section alt">
        <div class="container">
          <header class="section-head"><p class="kicker">03 · Typography</p><h2>Inter, with a mono for money</h2>
            <p class="lede">Inter for everything you read. JetBrains Mono for addresses, hashes and numbers that need to line up.</p></header>
          <div class="fonts">
            <article class="glass glass-lime font-card"><p class="font-glyph">Aa</p><div><h3>Inter</h3><p class="muted small">400 · 500 · 600 · 700 · 800</p><p class="font-chars">ABCDEFGHIJKLM<br />abcdefghijklm<br />0123456789 $€%</p></div>
              <a class="btn btn-ghost btn-sm" href="https://fonts.google.com/specimen/Inter" target="_blank" rel="noopener noreferrer">Google Fonts</a></article>
            <article class="glass glass-eth font-card mono-card"><p class="font-glyph">0x</p><div><h3>JetBrains Mono</h3><p class="muted small">500</p><p class="font-chars">0x7a3F…c91E<br />1,284.50 USDC<br />5Hq9…tK2p</p></div>
              <a class="btn btn-ghost btn-sm" href="https://fonts.google.com/specimen/JetBrains+Mono" target="_blank" rel="noopener noreferrer">Google Fonts</a></article>
          </div>
          <h3 class="group-title">Type scale</h3>
          <div class="type-scale">{type_rows}</div>
        </div>
      </section>

      <section id="gradients" class="brand-section">
        <div class="container">
          <header class="section-head"><p class="kicker">04 · Gradients</p><h2>Light, not loud</h2>
            <p class="lede">Gradients appear as glows and glass tints behind content, never behind body text.</p></header>
          <div class="grad-grid">{gradient_cards}</div>
        </div>
      </section>

      <section id="ui" class="brand-section alt">
        <div class="container">
          <header class="section-head"><p class="kicker">05 · Interface</p><h2>Building blocks</h2>
            <p class="lede">Pill buttons, 24px cards, glass with a gradient hairline. Lime marks the primary action.</p></header>
          <div class="ui-grid">
            <article class="card ui-card"><h3>Buttons</h3>
              <div class="ui-row"><span class="btn btn-primary">Swap now</span><span class="btn btn-ghost">Cancel</span></div>
              <div class="ui-row"><span class="btn btn-primary btn-sm">Approve</span><span class="btn btn-ghost btn-sm">Reject</span></div>
              <p class="muted small">Pill radius, 52px tall (40px small). One Lime button per view.</p></article>
            <article class="card ui-card"><h3>Chips and status</h3>
              <div class="ui-row"><span class="ui-chip ui-chip-lime">Verified</span><span class="ui-chip ui-chip-warn">Unverified site</span><span class="ui-chip ui-chip-err">Scam risk</span></div>
              <div class="ui-row"><span class="ui-chip"><img src="/chains/ethereum.png" alt="" width="18" height="18" />Ethereum</span><span class="ui-chip"><img src="/chains/solana.png" alt="" width="18" height="18" />Solana</span></div>
              <p class="muted small">Status uses a muted tint with a strong label colour.</p></article>
            <article class="glass glass-lime ui-card ui-balance"><p class="muted small">Total balance</p><p class="ui-amount">$12,480<span>.32</span></p><p class="ui-delta">+ $312.08 · 2.56% today</p>
              <p class="mono small muted">0x7a3F…c91E</p></article>
          </div>
        </div>
      </section>

      <section id="voice" class="brand-section lime">
        <div class="container">
          <header class="section-head"><p class="kicker"><span class="dot"></span>06 · Voice</p><h2>Clear, calm, honest.</h2></header>
          <div class="voice-grid">
            <article><h3>Clear before clever</h3><p>Rizon moves people's money, so every word must be unambiguous. Say what will happen, not how exciting it is.</p></article>
            <article><h3>Calm and direct</h3><p>Short sentences, active voice, plain English. Explain risk without fear.</p></article>
            <article><h3>Honest about self-custody</h3><p>No "unhackable" or "100% safe". We say plainly that nobody, including Awarizon, can recover a lost phrase.</p></article>
          </div>
          <div class="say-grid">
            <div class="say"><p class="say-label">Say</p><ul><li>You'll receive at least 1,280 USDC</li><li>This site wants unlimited access to your USDC</li><li>Swap · Send · Approve</li><li>Keep your recovery phrase offline</li></ul></div>
            <div class="say say-no"><p class="say-label">Not</p><ul><li>Get the best gains instantly!</li><li>DANGER!!! Malicious contract</li><li>Click here · Submit · OK</li><li>Your funds are 100% safe</li></ul></div>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="container footer-inner">
        <a class="brand" href="/"><img src="/icon.png" alt="" width="24" height="24" /><span>Rizon</span></a>
        <nav aria-label="Footer">
          <ul class="footer-links">
            <li><a href="/privacy/">Privacy</a></li>
            <li><a href="/brand/">Brand</a></li>
            <li><a href="https://awarizon.com">Awarizon</a></li>
          </ul>
        </nav>
        <p class="small muted">© <a class="inline-link" href="https://awarizon.com">Awarizon</a>. Rizon and the Rizon logo are trademarks of Awarizon.</p>
      </div>
    </footer>
    <div class="toast" role="status" aria-live="polite"></div>
    <script type="module" src="/src/brand.js"></script>
  </body>
</html>
"""
open("brand/index.html", "w", encoding="utf-8").write(page)

# zip
with zipfile.ZipFile("public/brand/rizon-brand-kit.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for f, *_ in LOGOS:
        z.write(f"public/brand/{f}", f"rizon-brand-kit/logos/{f}")
    z.write("public/brand/rizon-app-icon-512.png", "rizon-brand-kit/logos/rizon-app-icon-512.png")
    for f in ("colors.css", "tokens.json", "brand.md"):
        z.write(f"public/brand/{f}", f"rizon-brand-kit/{f}")
print("brand kit built:", os.path.getsize("public/brand/rizon-brand-kit.zip") // 1024, "KB zip")
for fg, bg, _ in PAIRS:
    print(f"  {name_of(fg):>16} on {name_of(bg):<10} {contrast(resolve(fg), resolve(bg)):.2f}")
