import { useMemo, useState } from "react";
import { call } from "../api";
import { Banner, Button, Icon, TopBar, useCopy } from "../components/ui";
import { useApp } from "../state";

// EVM derivation of an imported phrase: "rizon-v1" (older Rizon mobile installs) or "bip44" (standard / MetaMask).
type EvmDerivation = "bip44" | "rizon-v1";
interface DerivationResult {
  derivation: EvmDerivation | null;
  ambiguous: boolean;
  legacy: { address: string; used: boolean; checked: boolean };
  standard: { address: string; used: boolean; checked: boolean };
}

type Step =
  | { s: "welcome" }
  | { s: "password"; mode: "create" | "import"; mnemonic?: string; derivation?: EvmDerivation }
  | { s: "show"; mnemonic: string; password: string }
  | { s: "confirm"; mnemonic: string; password: string }
  | { s: "import" }
  | { s: "choose"; result: DerivationResult; source: "phrase" | "google"; mnemonic?: string }
  | { s: "google" }
  | { s: "googlePassword"; derivation: EvmDerivation }
  | { s: "done" };

export function Onboarding() {
  const [step, setStep] = useState<Step>({ s: "welcome" });
  const { refresh } = useApp();

  switch (step.s) {
    case "welcome":
      return (
        <div className="screen center" style={{ alignItems: "center", textAlign: "center", gap: 16 }}>
          <img className="logo-mark" src="icons/icon128.png" alt="" />
          <div>
            <h1 className="h2">Welcome to Rizon</h1>
            <p className="p" style={{ marginTop: 6 }}>
              A self-custody wallet for Ethereum, Base, Arc, Robinhood Chain, Solana and more.
            </p>
          </div>
          <div className="col" style={{ width: "100%", gap: 10, marginTop: 12 }}>
            <Button className="block" onClick={() => setStep({ s: "password", mode: "create" })}>
              Create a new wallet
            </Button>
            <Button variant="secondary" className="block" onClick={() => setStep({ s: "import" })}>
              I already have a recovery phrase
            </Button>
            <Button variant="ghost" className="block" onClick={() => setStep({ s: "google" })}>
              Restore from Google Drive backup
            </Button>
          </div>
          <p className="tiny muted">Using Rizon on your phone? Import the same recovery phrase to see the same accounts.</p>
        </div>
      );

    case "google":
      return (
        <GoogleRestore
          onBack={() => setStep({ s: "welcome" })}
          onFound={(result) =>
            setStep(result.ambiguous || !result.derivation ? { s: "choose", result, source: "google" } : { s: "googlePassword", derivation: result.derivation })
          }
        />
      );

    case "choose":
      return (
        <ChooseDerivation
          result={step.result}
          onBack={() => setStep(step.source === "google" ? { s: "google" } : { s: "import" })}
          onPick={(derivation) =>
            setStep(
              step.source === "google"
                ? { s: "googlePassword", derivation }
                : { s: "password", mode: "import", mnemonic: step.mnemonic, derivation },
            )
          }
        />
      );

    case "googlePassword":
      return (
        <CreatePassword
          onBack={() => setStep({ s: "google" })}
          cta="Restore wallet"
          onNext={async (password) => {
            await call("cloudRestoreFinish", { password, evmDerivation: step.derivation });
            setStep({ s: "done" });
          }}
        />
      );

    case "import":
      return (
        <ImportPhrase
          onBack={() => setStep({ s: "welcome" })}
          onNext={(m, result) =>
            setStep(
              result.ambiguous || !result.derivation
                ? { s: "choose", result, source: "phrase", mnemonic: m }
                : { s: "password", mode: "import", mnemonic: m, derivation: result.derivation },
            )
          }
        />
      );

    case "password":
      return (
        <CreatePassword
          onBack={() => setStep(step.mode === "import" ? { s: "import" } : { s: "welcome" })}
          cta={step.mode === "import" ? "Import wallet" : "Continue"}
          onNext={async (password) => {
            if (step.mode === "import") {
              await call("importWallet", { password, mnemonic: step.mnemonic, evmDerivation: step.derivation });
              setStep({ s: "done" });
            } else {
              const mnemonic = await call<string>("generateMnemonic");
              setStep({ s: "show", mnemonic, password });
            }
          }}
        />
      );

    case "show":
      return <ShowPhrase mnemonic={step.mnemonic} onNext={() => setStep({ s: "confirm", mnemonic: step.mnemonic, password: step.password })} />;

    case "confirm":
      return (
        <ConfirmPhrase
          mnemonic={step.mnemonic}
          onBack={() => setStep({ s: "show", mnemonic: step.mnemonic, password: step.password })}
          onDone={async () => {
            await call("createWallet", { password: step.password, mnemonic: step.mnemonic });
            setStep({ s: "done" });
          }}
        />
      );

    case "done":
      return (
        <div className="screen center" style={{ alignItems: "center", textAlign: "center", gap: 14 }}>
          <div className="action">
            <span className="circle" style={{ width: 64, height: 64 }}>
              <Icon name="check" size={30} />
            </span>
          </div>
          <h1 className="h2">You're all set</h1>
          <p className="p">
            Pin Rizon to your toolbar: click the puzzle-piece icon, then the pin next to Rizon. Websites can now connect to your
            wallet — you approve every request.
          </p>
          <Button
            className="block"
            onClick={async () => {
              await refresh();
              if (location.hash.startsWith("#/onboarding")) window.close();
            }}
          >
            Done
          </Button>
        </div>
      );
  }
}

function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ["Too short", "Weak", "Fair", "Good", "Strong", "Very strong"][s] };
}

function CreatePassword({ onBack, onNext, cta }: { onBack: () => void; onNext: (pw: string) => Promise<void>; cta: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const st = strength(pw);
  const valid = pw.length >= 8 && pw === pw2 && agree;
  return (
    <>
      <TopBar title="Create password" onBack={onBack} />
      <form
        className="screen"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          setErr("");
          try {
            await onNext(pw);
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="p">This password unlocks Rizon on this computer only. It can't recover your wallet — your recovery phrase does that.</p>
        <div className="field">
          <label htmlFor="pw">New password</label>
          <input id="pw" className="input" type="password" autoFocus autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          {pw && (
            <span className="small" style={{ color: st.score >= 3 ? "var(--success)" : "var(--warning)" }}>
              {st.label}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="pw2">Confirm password</label>
          <input
            id="pw2"
            className={`input ${pw2 && pw2 !== pw ? "error" : ""}`}
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
          {pw2 && pw2 !== pw && <span className="error-text">Passwords don't match</span>}
        </div>
        <label className="check small">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I understand Rizon can't reset this password or recover my wallet for me.</span>
        </label>
        {err && <Banner kind="danger">{err}</Banner>}
        <div style={{ flex: 1 }} />
        <Button type="submit" className="block" disabled={!valid} loading={busy}>
          {cta}
        </Button>
      </form>
    </>
  );
}

function ShowPhrase({ mnemonic, onNext }: { mnemonic: string; onNext: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [saved, setSaved] = useState(false);
  const copy = useCopy();
  const words = mnemonic.split(" ");
  return (
    <>
      <TopBar title="Recovery phrase" />
      <div className="screen">
        <p className="p">Write these 12 words down in order and keep them somewhere safe and offline. Anyone with them can take your funds.</p>
        <Banner kind="danger">Never share this phrase. Rizon will never ask for it.</Banner>
        <div className="reveal-wrap">
          <div className={`phrase-grid ${revealed ? "" : "blurred"}`}>
            {words.map((w, i) => (
              <div className="phrase-word" key={i}>
                <span className="n">{i + 1}</span>
                {w}
              </div>
            ))}
          </div>
          {!revealed && (
            <div className="reveal-cover">
              <Button variant="secondary" onClick={() => setRevealed(true)}>
                <Icon name="eye" /> Reveal phrase
              </Button>
            </div>
          )}
        </div>
        {revealed && (
          <Button
            variant="ghost"
            onClick={() => {
              copy(mnemonic, "Copied — clipboard clears in 60s");
              setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 60_000);
            }}
          >
            <Icon name="copy" size={16} /> Copy to clipboard
          </Button>
        )}
        <label className="check small">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} disabled={!revealed} />
          <span>I've saved my recovery phrase somewhere safe.</span>
        </label>
        <div style={{ flex: 1 }} />
        <Button className="block" disabled={!saved} onClick={onNext}>
          Continue
        </Button>
      </div>
    </>
  );
}

function ConfirmPhrase({ mnemonic, onBack, onDone }: { mnemonic: string; onBack: () => void; onDone: () => Promise<void> }) {
  const words = mnemonic.split(" ");
  // Ask for three random positions, each with 6 shuffled choices.
  const quiz = useMemo(() => {
    const picks = new Set<number>();
    while (picks.size < 3) picks.add(crypto.getRandomValues(new Uint32Array(1))[0] % words.length);
    return [...picks]
      .sort((a, b) => a - b)
      .map((pos) => {
        const decoys = new Set<string>();
        while (decoys.size < 5) {
          const w = words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
          if (w !== words[pos]) decoys.add(w);
          if (new Set(words).size <= 5) break;
        }
        const options = [words[pos], ...decoys].sort(() => (crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? 1 : -1));
        return { pos, options };
      });
  }, [mnemonic]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const allRight = quiz.every((q) => answers[q.pos] === words[q.pos]);
  return (
    <>
      <TopBar title="Confirm phrase" onBack={onBack} />
      <div className="screen">
        <p className="p">Select the right words to confirm you saved your phrase.</p>
        {quiz.map((q) => (
          <div key={q.pos} className="col" style={{ gap: 8 }}>
            <span className="small" style={{ fontWeight: 600 }}>
              Word #{q.pos + 1}
            </span>
            <div className="choice-grid">
              {q.options.map((o) => {
                const chosen = answers[q.pos] === o;
                return (
                  <button
                    key={o}
                    className={`choice ${chosen ? (o === words[q.pos] ? "correct" : "wrong") : ""}`}
                    onClick={() => setAnswers((a) => ({ ...a, [q.pos]: o }))}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {err && <Banner kind="danger">{err}</Banner>}
        <div style={{ flex: 1 }} />
        <Button
          className="block"
          disabled={!allRight}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await onDone();
            } catch (e: any) {
              setErr(e.message);
              setBusy(false);
            }
          }}
        >
          Create wallet
        </Button>
      </div>
    </>
  );
}

function ImportPhrase({ onBack, onNext }: { onBack: () => void; onNext: (m: string, result: DerivationResult) => void }) {
  const [phrase, setPhrase] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const count = phrase.trim() ? phrase.trim().split(/\s+/).length : 0;
  return (
    <>
      <TopBar title="Import wallet" onBack={onBack} />
      <form
        className="screen"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            if (!(await call<boolean>("validateMnemonic", { phrase }))) {
              setErr("That recovery phrase isn't valid. Check each word and the order.");
              return;
            }
            // Older Rizon mobile wallets use different EVM addresses from MetaMask; find which this phrase uses.
            const result = await call<DerivationResult>("detectEvmDerivation", { mnemonic: phrase });
            onNext(phrase, result);
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="p">Enter your 12 or 24-word recovery phrase, with a space between each word. Your Rizon mobile phrase works here.</p>
        <textarea
          className="input mono"
          style={{ minHeight: 120 }}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder="word1 word2 word3 …"
        />
        <span className="small muted">{count} words</span>
        {err && <Banner kind="danger">{err}</Banner>}
        <div style={{ flex: 1 }} />
        <Button type="submit" className="block" disabled={![12, 15, 18, 21, 24].includes(count)} loading={busy}>
          {busy ? "Finding your accounts…" : "Continue"}
        </Button>
      </form>
    </>
  );
}

function GoogleRestore({ onBack, onFound }: { onBack: () => void; onFound: (result: DerivationResult) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [found, setFound] = useState<{
    email?: string;
    addressHint: string | null;
    createdAt: string | null;
    derivation: DerivationResult;
  } | null>(null);
  const [none, setNone] = useState<string | null>(null);
  return (
    <>
      <TopBar title="Restore from Google" onBack={onBack} />
      <div className="screen">
        <p className="p">Sign in with the Google account you used for Rizon backup on your phone. Rizon only reads its own hidden backup folder.</p>
        {found && (
          <div className="card">
            <div className="small muted">Backup found{found.email ? ` in ${found.email}` : ""}</div>
            {found.addressHint && <div className="mono" style={{ marginTop: 4 }}>{found.addressHint}</div>}
            {found.createdAt && <div className="tiny muted">Saved {new Date(found.createdAt).toLocaleString()}</div>}
          </div>
        )}
        {none && <Banner>No Rizon backup was found in {none}. Try another Google account, or import your recovery phrase.</Banner>}
        {err && <Banner kind="danger">{err}</Banner>}
        <div style={{ flex: 1 }} />
        {found ? (
          <Button className="block" onClick={() => onFound(found.derivation)}>
            Continue
          </Button>
        ) : (
          <Button
            className="block"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr("");
              setNone(null);
              try {
                const r = await call("cloudRestoreStart");
                if (r.found) setFound(r);
                else setNone(r.email ?? "that account");
              } catch (e: any) {
                setErr(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign in with Google
          </Button>
        )}
      </div>
    </>
  );
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Shown only when we can't tell which EVM derivation a phrase uses. */
function ChooseDerivation({
  result,
  onBack,
  onPick,
}: {
  result: DerivationResult;
  onBack: () => void;
  onPick: (d: EvmDerivation) => void;
}) {
  const both = result.legacy.used && result.standard.used;
  const options: { d: EvmDerivation; title: string; text: string; address: string }[] = [
    { d: "rizon-v1", title: "Rizon wallet", text: "Created in the Rizon mobile app before this update.", address: result.legacy.address },
    { d: "bip44", title: "Standard", text: "MetaMask and most other wallets.", address: result.standard.address },
  ];
  return (
    <>
      <TopBar title="Choose accounts" onBack={onBack} />
      <div className="screen">
        <p className="p">
          {both
            ? "This recovery phrase has been used at two different addresses. Which one do you want to open?"
            : "We couldn't reach the network to check this phrase. Pick where it came from."}
        </p>
        {options.map((o) => (
          <button key={o.d} type="button" className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => onPick(o.d)}>
            <div style={{ fontWeight: 700 }}>{o.title}</div>
            <div className="small muted">{o.text}</div>
            <div className="mono small" style={{ marginTop: 6 }}>{short(o.address)}</div>
          </button>
        ))}
        <p className="tiny muted">Your Solana account is the same either way.</p>
      </div>
    </>
  );
}
