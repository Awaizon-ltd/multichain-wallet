"""Converts store/PRIVACY_POLICY.md into the website's /privacy page (simple Markdown subset)."""
import html, re, sys

R = sys.argv[1]
SITE = "https://rizon.awarizon.com"
src_path = R + "/crypto-extension/store/PRIVACY_POLICY.md"

# Add the website to the policy's contact section (once).
md = open(src_path, encoding="utf-8").read()
if SITE not in md:
    md = md.replace("[privacy@awarizon.com]\n", "[privacy@awarizon.com]\n" + SITE + "\n", 1) if md.rstrip().endswith("[privacy@awarizon.com]") else md.rstrip() + "\n" + SITE + "\n"
    open(src_path, "w", encoding="utf-8").write(md)

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![*\w])\*([^*]+)\*(?!\*)", r"<em>\1</em>", t)
    t = re.sub(r"(https://[^\s<)]+)", r'<a href="\1">\1</a>', t)
    return t

out, para, lst, table = [], [], [], []
def flush():
    global para, lst, table
    if para:
        out.append("<p>" + "<br />".join(inline(x) for x in para) + "</p>")
        para = []
    if lst:
        out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in lst) + "</ul>")
        lst = []
    if table:
        rows = [r for r in table if not re.match(r"^\|[\s\-|]+\|$", r)]
        cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows]
        head = "".join(f"<th>{inline(c)}</th>" for c in cells[0])
        body = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in cells[1:])
        out.append(f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>')
        table = []

title = "Privacy Policy"
for line in md.splitlines():
    if line.startswith("*DRAFT"):
        out.append("<!-- DRAFT: fill every [BRACKETED] placeholder and have this reviewed before launch. -->")
        continue
    if line.startswith("# "):
        flush(); title = line[2:].strip(); continue
    if line.startswith("## "):
        flush(); out.append(f"<h2>{inline(line[3:])}</h2>"); continue
    if line.startswith("|"):
        if para or lst: flush()
        table.append(line); continue
    if line.startswith("- "):
        if para or table: flush()
        lst.append(line[2:]); continue
    if not line.strip():
        flush(); continue
    if table or lst: flush()
    para.append(line)
flush()

page = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Privacy Policy — Rizon Wallet</title>
    <meta name="description" content="How Rizon Wallet handles your data: keys stay on your device, and only what's needed to show balances and build transactions is shared." />
    <meta name="theme-color" content="#0a0a0a" />
    <link rel="canonical" href="{SITE}/privacy" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
  </head>
  <body class="doc-page">
    <a class="skip" href="#main">Skip to content</a>
    <header class="nav scrolled">
      <div class="nav-shell">
        <a class="brand" href="/" aria-label="Rizon home"><img src="/icon.png" alt="" width="32" height="32" /><span>Rizon</span></a>
        <a class="btn btn-primary btn-sm" href="/" style="margin-left: auto">Back to site</a>
      </div>
    </header>
    <main id="main" class="doc">
      <div class="container narrow">
        <p class="kicker">Legal</p>
        <h1 class="doc-title">{html.escape(title.replace("Rizon Wallet — ", ""))}</h1>
        <p class="doc-sub">Rizon Wallet · {SITE.replace("https://", "")}</p>
        <article class="doc-body">
          {chr(10).join(out)}
        </article>
      </div>
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
        <p class="small muted">© <a class="inline-link" href="https://awarizon.com">Awarizon</a>. Rizon is self-custody software; you are responsible for your recovery phrase.</p>
      </div>
    </footer>
    <script type="module" src="/src/doc.js"></script>
  </body>
</html>
"""
import os
os.makedirs(R + "/website/privacy", exist_ok=True)
open(R + "/website/privacy/index.html", "w", encoding="utf-8").write(page)
print("wrote privacy/index.html,", len(out), "blocks")
