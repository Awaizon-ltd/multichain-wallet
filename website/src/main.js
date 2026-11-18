import "./style.css";
import { animate, inView, scroll, stagger } from "motion";

/* ---------------------------------------------------------------------------
   Links — fill these in when the listings go live. Empty = scroll to #download
   and show "coming soon".
--------------------------------------------------------------------------- */
const LINKS = {
  chrome: "", // e.g. https://chromewebstore.google.com/detail/rizon-wallet/<id>
  mobile: "https://play.google.com/store/apps/details?id=com.awarizon.wallet",
  privacy: "/privacy/",
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const SPRING = { type: "spring", stiffness: 260, damping: 26 };
const EASE_OUT = [0.22, 1, 0.36, 1];
window.__rizonReady = true; // tells the head script not to un-hide content
const root = document.documentElement;

/* ------------------------------- links etc ------------------------------- */

document.getElementById("year").textContent = String(new Date().getFullYear());
for (const a of document.querySelectorAll("[data-link]")) {
  const url = LINKS[a.dataset.link];
  if (url) {
    a.href = url;
  } else if (a.dataset.link !== "privacy") {
    a.addEventListener("click", () => (document.getElementById("download-note").hidden = false));
  }
}

// Only the store buttons (Google Play / Chrome Web Store) open in a new tab.
for (const a of document.querySelectorAll('a[data-link="chrome"], a[data-link="mobile"]')) {
  if (!LINKS[a.dataset.link]) continue; // no listing yet → stays on this page
  a.target = "_blank";
  a.rel = "noopener noreferrer";
}

/* ------------------------------- nav ------------------------------- */

const nav = document.querySelector(".nav");
const progressBar = document.querySelector(".nav-progress");
const onScrollNav = () => nav.classList.toggle("scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScrollNav, { passive: true });
onScrollNav();
scroll((p) => (progressBar.style.transform = `scaleX(${p})`));

// Scroll-spy: the lime pill slides to the section you're reading.
const indicator = document.querySelector(".nav-indicator");
const spyLinks = [...document.querySelectorAll("[data-spy]")];
let activeId = "";
function moveIndicator(link) {
  spyLinks.forEach((l) => l.classList.toggle("active", l === link));
  if (!link) {
    animate(indicator, { opacity: 0 }, { duration: 0.2 });
    return;
  }
  const group = link.parentElement.getBoundingClientRect();
  const r = link.getBoundingClientRect();
  const target = { left: `${r.left - group.left}px`, width: `${r.width}px`, opacity: 1 };
  if (reducedMotion) Object.assign(indicator.style, target);
  else animate(indicator, target, SPRING);
}
const sections = spyLinks.map((l) => document.getElementById(l.dataset.spy)).filter(Boolean);
const spy = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting && e.target.id !== activeId) {
        activeId = e.target.id;
        moveIndicator(spyLinks.find((l) => l.dataset.spy === activeId));
      }
    }
  },
  { rootMargin: "-45% 0px -50% 0px" },
);
sections.forEach((s) => spy.observe(s));
window.addEventListener(
  "scroll",
  () => {
    if (window.scrollY < window.innerHeight * 0.4 && activeId) {
      activeId = "";
      moveIndicator(null);
    }
  },
  { passive: true },
);
window.addEventListener("resize", () => moveIndicator(spyLinks.find((l) => l.dataset.spy === activeId)));

/* ------------------------------- reveals (motion) ------------------------------- */

if (!reducedMotion) {
  root.classList.add("motion-on"); // below-the-fold elements start hidden until in view

  // Hero: headline lines rise and un-blur, then the rest follows.
  animate("h1 .line", { opacity: [0, 1], y: [40, 0], filter: ["blur(10px)", "blur(0px)"] }, { duration: 0.9, delay: stagger(0.12), ease: EASE_OUT });
  animate(".hero .anim-in", { opacity: [0, 1], y: [18, 0] }, { duration: 0.8, delay: stagger(0.08, { startDelay: 0.25 }), ease: EASE_OUT });

  inView(".reveal", (el) => void animate(el, { opacity: [0, 1], y: [32, 0] }, { duration: 0.8, ease: EASE_OUT }), { margin: "0px 0px -12% 0px" });
  inView(
    ".stagger",
    // An array (not an HTMLCollection) so motion animates each child.
    (el) => void animate([...el.children], { opacity: [0, 1], y: [28, 0], scale: [0.97, 1] }, { duration: 0.7, delay: stagger(0.07), ease: EASE_OUT }),
    { margin: "0px 0px -10% 0px" },
  );
  // Opacity + blur only: .device-tilt keeps its own CSS transform.
  inView(".device", (el) => void animate(el, { opacity: [0, 1], filter: ["blur(12px)", "blur(0px)"] }, { duration: 0.9, ease: EASE_OUT }));
}
root.classList.remove("motion-pending");

/* ------------------------------- stacked sections ------------------------------- */
// A pinned (.stack-under) section sticks once its bottom reaches the viewport;
// the next section (.overlay) then slides over it. As it does, the pinned one eases
// back and dims (--cover 0→1). Scrolling up reverses everything.
const pinned = [...document.querySelectorAll(".stack-under")];
const setStick = () => pinned.forEach((el) => el.style.setProperty("--stick", `${Math.min(0, window.innerHeight - el.offsetHeight)}px`));
setStick();
window.addEventListener("resize", setStick);
const ro = new ResizeObserver(setStick);
pinned.forEach((el) => ro.observe(el));
for (const el of pinned) {
  const over = el.nextElementSibling;
  if (!over?.classList.contains("overlay")) continue;
  scroll(
    (p) => {
      if (!reducedMotion) el.style.setProperty("--cover", p.toFixed(3));
      el.dataset.covered = p > 0.995 ? "1" : "0"; // the 3D scene skips covered sections
    },
    { target: over, offset: ["start end", "start start"] },
  );
}

/* ------------------------------- micro-interactions ------------------------------- */

// Cursor spotlight on glass cards.
for (const el of document.querySelectorAll(".spot")) {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
}

// Magnetic buttons (mouse only).
if (finePointer && !reducedMotion) {
  for (const el of document.querySelectorAll(".magnetic")) {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      animate(el, { x: dx * 0.22, y: dy * 0.3 }, { type: "spring", stiffness: 300, damping: 18 });
    });
    el.addEventListener("pointerleave", () => animate(el, { x: 0, y: 0 }, { type: "spring", stiffness: 300, damping: 16 }));
  }
}

/* ------------------------------- phone mockups ------------------------------- */

const phonesWrap = document.querySelector(".phones");
const phones = [...document.querySelectorAll(".phone")];
if (phonesWrap && !reducedMotion) {
  phones.forEach((p) => (p.style.opacity = "0"));
  inView(phonesWrap, () => {
    // Fan in from below, then float gently out of phase.
    phones.forEach((p, i) => {
      animate(p, { opacity: i === 1 ? 1 : 0.9, "--fy": ["70px", "0px"] }, { duration: 1, delay: i * 0.1, ease: EASE_OUT }).then(() =>
        animate(p, { "--fy": ["0px", i === 1 ? "-16px" : "-10px"] }, { duration: 3.2 + i * 0.6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }),
      );
    });
  });
  // Scroll parallax: side phones drift more than the centre one.
  scroll(
    (p) => phones.forEach((ph, i) => ph.style.setProperty("--py", `${(0.5 - p) * (i === 1 ? 50 : 110)}px`)),
    { target: phonesWrap, offset: ["start end", "end start"] },
  );
  // Pointer tilt.
  if (finePointer) {
    phonesWrap.addEventListener("pointermove", (e) => {
      const r = phonesWrap.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      animate(phones, { "--ry": `${nx * 16}deg`, "--rx": `${-ny * 10}deg` }, { type: "spring", stiffness: 120, damping: 18 });
    });
    phonesWrap.addEventListener("pointerleave", () => animate(phones, { "--ry": "0deg", "--rx": "0deg" }, { type: "spring", stiffness: 120, damping: 16 }));
  }
}

/* ------------------------------- showcase tabs ------------------------------- */

const SHOTS = {
  home: ["All your assets, one view", "Balances and prices across every network you enable, with your @username front and centre.", "Rizon portfolio screen showing balances across Base and Solana"],
  swap: ["Swap and bridge in a click", "See what you'll receive, the minimum after slippage and the price impact — before you confirm.", "Rizon swap screen selling ETH for USDC on Base"],
  connect: ["Connect on your terms", "Pick exactly which account a site sees. Verified sites are marked; risky ones are called out.", "Rizon connection request from a verified site"],
  coin: ["Track the market", "Trending tokens, gainers and losers, with live charts for every period.", "Rizon market screen with a Solana price chart"],
};
const tabs = [...document.querySelectorAll(".tabs [role=tab]")];
const shotImg = document.getElementById("showcase-img");
const selectTab = (tab, focus = false) => {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  }
  document.getElementById("panel-portfolio").setAttribute("aria-labelledby", tab.id);
  const [title, text, alt] = SHOTS[tab.dataset.shot];
  document.getElementById("showcase-title-sub").textContent = title;
  document.getElementById("showcase-text").textContent = text;
  const next = `/screens/${tab.dataset.shot}.png`;
  if (reducedMotion) {
    shotImg.src = next;
    shotImg.alt = alt;
  } else {
    shotImg.classList.add("swapping");
    setTimeout(() => {
      shotImg.src = next;
      shotImg.alt = alt;
      shotImg.onload = () => shotImg.classList.remove("swapping");
    }, 180);
  }
  if (focus) tab.focus();
};
tabs.forEach((t, i) => {
  t.addEventListener("click", () => selectTab(t));
  t.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") selectTab(tabs[(i + 1) % tabs.length], true);
    if (e.key === "ArrowLeft") selectTab(tabs[(i - 1 + tabs.length) % tabs.length], true);
    if (e.key === "Home") selectTab(tabs[0], true);
    if (e.key === "End") selectTab(tabs[tabs.length - 1], true);
  });
});
Object.keys(SHOTS).forEach((k) => (new Image().src = `/screens/${k}.png`));

/* ---------------------------- 3D scene (lazy) ----------------------------
   three.js loads as its own chunk after the page is interactive. */
const startScene = () => import("./scene.js").then((m) => m.initScene(document.getElementById("scene"), reducedMotion));
if ("requestIdleCallback" in window) requestIdleCallback(startScene, { timeout: 1200 });
else setTimeout(startScene, 200);
