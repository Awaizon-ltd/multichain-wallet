// /brand page: shared styles + brand-kit styles, and click-to-copy for colour values and gradients.
import "./style.css";
import "./brand.css";

const toast = document.querySelector(".toast");
let hideTimer;
function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => toast.classList.remove("show"), 1600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts and older browsers.
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button.copy");
  if (!btn) return;
  const value = btn.dataset.copy;
  const ok = await copyText(value);
  showToast(ok ? `Copied ${value.length > 40 ? "gradient CSS" : value}` : "Couldn't copy. Select the text instead.");
  if (ok) {
    btn.classList.add("copied");
    setTimeout(() => btn.classList.remove("copied"), 1200);
  }
});
