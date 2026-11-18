# Rizon website

The marketing site for Rizon Wallet. It's a static site built with Vite and three.js, in the dark theme only, using the same tokens as the mobile app and extension.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/ (static files: deploy to Vercel, Netlify, Cloudflare Pages, S3…)
npm run preview    # serve the production build on :4173
```

## Before launch
- **Store links:** set `LINKS.chrome` and `LINKS.mobile` (the Google Play page) at the top of `src/main.js`. While they're empty, the buttons scroll to the download section and show "coming soon".
- **Brand kit:** `/brand/` (https://rizon.awarizon.com/brand; `/brand-design` redirects there). Colours, type scale, gradients and voice all live in `scripts/build-brand.py`. Edit that file, then run `python scripts/build-brand.py` from `website/` and rebuild. It regenerates `brand/index.html`, `public/brand/{colors.css,tokens.json,brand.md,rizon-brand-kit.zip}` and `../brand.md`. The logo PNGs in `public/brand/` are static files.
- **Privacy page:** built in at `/privacy/` (https://rizon.awarizon.com/privacy), generated from `crypto-extension/store/PRIVACY_POLICY.md`. Fill in its `[BRACKETED]` placeholders and have it reviewed, then regenerate with `python scripts/build-privacy.py ..` (run from `website/`) and rebuild. The Chrome Web Store form uses this same URL.
- **Domain:** the official site is **https://rizon.awarizon.com**. The canonical and social-preview tags already point there. In DNS, point `rizon` at your host (for example a CNAME to Vercel, Netlify or Cloudflare Pages) and enable HTTPS.
- **Social preview:** `public/og.png`, served at `https://rizon.awarizon.com/og.png`.

## Deploying to Apache (cPanel or shared hosting)
1. Run `npm run build`.
2. Upload the **contents** of `dist/` to the document root for rizon.awarizon.com. Include the hidden `.htaccess` file; in cPanel's File Manager, turn on "Show hidden files".
3. `.htaccess` (from `public/.htaccess`) needs `mod_rewrite`, which almost every host has. It:
   - serves `/privacy` and `/privacy/` from `privacy/index.html`, so there's no 404;
   - sends unknown page URLs to the homepage instead of "Page not found";
   - still returns a real 404 for missing files, so a broken image or script never receives HTML;
   - forces HTTPS, compresses text, caches hashed assets for a year and HTML never, and adds basic security headers.

On Vercel, Netlify or Cloudflare Pages, `.htaccess` is ignored. Those hosts already serve `/privacy/` and only need a "404 → /index.html" rule if you want the same fallback.

## Assets
- **Chain icons** (`public/chains`): from cryptologos.cc, resized to 256 px. Polygon uses the MATIC mark (the POL logo isn't on cryptologos). Base isn't listed there, so it comes from Base's official GitHub avatar. Arc and Robinhood are from the mobile app.
- **Google Play badge** (`public/google-play-badge.png`): the official badge from Google, with transparent padding trimmed. Follow Google's badge guidelines and don't recolour or alter it.

## How it's built
- `index.html` holds all content: semantic sections and real links, so it works without JavaScript.
- `src/main.js` (about 4 KB) runs the nav, reveal-on-scroll, the accessible showcase tabs and the links. It lazy-loads the scene after the page is interactive.
- `src/scene.js` is all the 3D, loaded as its own chunk (about 130 KB gzipped). One fixed WebGL canvas sits behind the page, with a stage pinned to each section's slot:
  - **Hero:** a Rizon coin, orbit rings with travelling nodes, and two floating screens of the real extension UI (`public/screens`).
  - **Networks:** an orbit system, with every supported chain's logo (`public/chains`) circling a Rizon core.
  - **Features:** blocks that keep re-arranging (chain → grid → stack → ring), with chain links and a pulsing "newest block".
  - **Download:** a spiral galaxy.

  Each stage scales to fit its slot, scrolls with the page, and is skipped while off screen.
- **Respects reduced motion:** visitors who ask for reduced motion get one static frame.
- **Falls back without WebGL:** it shows a CSS gradient.
- **Pauses when hidden:** rendering stops when the tab isn't visible, and the pixel ratio is capped at 1.75.

To refresh the screenshots after UI changes, re-run the store capture and copy `crypto-extension/store/raw/*.png` into `public/screens/`.
