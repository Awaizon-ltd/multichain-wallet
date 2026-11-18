import { useEffect, useState } from "react";
import { EVM_CHAINS, SOLANA, type NetworkId } from "../../shared/chains";
import type { Settings as SettingsT, SitePermission } from "../../shared/messages";
import { call } from "../api";
import { Avatar, Banner, Button, Icon, Kv, SiteIcon, Toggle, TopBar, useCopy, useToast } from "../components/ui";
import { shortAddress, siteHost, timeAgo } from "../format";
import { useApp, useRouter } from "../state";
import { checkUsername, identityByAddress, type Identity } from "../data";
import { USERNAME_RE } from "../../shared/config";

const VERSION = chrome.runtime.getManifest().version;

export function Settings() {
  const { go } = useRouter();
  const { refresh } = useApp();
  const items: { icon: string; label: string; to: string }[] = [
    { icon: "edit", label: "Accounts", to: "settings.accounts" },
    { icon: "info", label: "Username", to: "settings.username" },
    { icon: "key", label: "Cloud backup", to: "settings.backup" },
    { icon: "network", label: "Networks", to: "settings.networks" },
    { icon: "globe", label: "Connected sites", to: "settings.sites" },
    { icon: "shield", label: "Security & privacy", to: "settings.security" },
    { icon: "settings", label: "Preferences", to: "settings.preferences" },
  ];
  return (
    <>
      <TopBar title="Settings" />
      <div className="screen">
        <div className="card flush">
          {items.map((i) => (
            <button key={i.to} className="list-item" onClick={() => go({ name: i.to })}>
              <Icon name={i.icon} />
              <span className="grow">{i.label}</span>
              <Icon name="chevron" size={16} />
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          className="block"
          onClick={async () => {
            await call("lock");
            await refresh();
          }}
        >
          <Icon name="lock" size={16} /> Lock Rizon
        </Button>
        <p className="tiny muted" style={{ textAlign: "center" }}>
          Rizon Wallet v{VERSION}
        </p>
      </div>
    </>
  );
}

export function AccountsSettings() {
  const { state, refresh } = useApp();
  const { back } = useRouter();
  const copy = useCopy();
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  if (!state) return null;
  return (
    <>
      <TopBar title="Accounts" onBack={back} />
      <div className="screen">
        <div className="card flush">
          {state.accounts.map((a) => (
            <div key={a.index} className="list-item static" style={{ alignItems: "flex-start" }}>
              <Avatar seed={a.evm} label={String(a.index + 1)} />
              <div className="grow col" style={{ minWidth: 0 }}>
                {editing === a.index ? (
                  <form
                    className="row"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await call("renameAccount", { index: a.index, name });
                      setEditing(null);
                      await refresh();
                    }}
                  >
                    <input className="input" style={{ height: 34 }} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={32} />
                    <Button className="sm" type="submit">
                      Save
                    </Button>
                  </form>
                ) : (
                  <span className="row" style={{ gap: 6 }}>
                    <strong>{a.name}</strong>
                    {a.index === state.selectedIndex && <span className="pill brand">Active</span>}
                    <button
                      className="icon-btn"
                      style={{ width: 24, height: 24 }}
                      aria-label="Rename"
                      onClick={() => {
                        setEditing(a.index);
                        setName(a.name);
                      }}
                    >
                      <Icon name="edit" size={14} />
                    </button>
                  </span>
                )}
                <button className="small muted mono" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => copy(a.evm, "EVM address copied")}>
                  EVM {shortAddress(a.evm, 6)}
                </button>
                <button className="small muted mono" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => copy(a.solana, "Solana address copied")}>
                  SOL {shortAddress(a.solana, 6)}
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          className="block"
          onClick={async () => {
            await call("addAccount", {});
            await refresh();
          }}
        >
          <Icon name="plus" size={16} /> Add account
        </Button>
        <p className="tiny muted">Every account comes from your one recovery phrase, in the same order as in the Rizon mobile app.</p>
      </div>
    </>
  );
}

export function NetworksSettings() {
  const { state, refresh } = useApp();
  const { back } = useRouter();
  if (!state) return null;
  const s = state.settings;
  const set = async (patch: Partial<SettingsT>) => {
    await call("updateSettings", patch);
    await refresh();
  };
  const toggle = (id: NetworkId, on: boolean) =>
    set({ enabledNetworks: on ? [...s.enabledNetworks, id] : s.enabledNetworks.filter((n) => n !== id) });
  const nets = [
    { id: SOLANA.id as NetworkId, name: SOLANA.name, icon: SOLANA.icon, testnet: false },
    ...EVM_CHAINS.map((c) => ({ id: c.id as NetworkId, name: c.name, icon: c.icon, testnet: c.testnet })),
  ].filter((n) => s.showTestnets || !n.testnet);
  return (
    <>
      <TopBar title="Networks" onBack={back} />
      <div className="screen">
        <p className="small muted" style={{ margin: 0 }}>
          Choose which networks appear in your portfolio. dApps can still use any supported network.
        </p>
        <div className="card flush">
          {nets.map((n) => (
            <div key={String(n.id)} className="list-item static">
              <div className="token-icon">
                <img src={n.icon} alt="" />
              </div>
              <span className="grow">
                {n.name} {n.testnet && <span className="pill">Testnet</span>}
              </span>
              <Toggle label={n.name} checked={s.enabledNetworks.includes(n.id)} onChange={(on) => toggle(n.id, on)} />
            </div>
          ))}
        </div>
        <div className="card row between">
          <span>Show testnets</span>
          <Toggle label="Show testnets" checked={s.showTestnets} onChange={(v) => set({ showTestnets: v })} />
        </div>
      </div>
    </>
  );
}

export function SitesSettings() {
  const { back } = useRouter();
  const [sites, setSites] = useState<SitePermission[] | null>(null);
  const load = () => call<SitePermission[]>("listSites").then(setSites);
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <TopBar title="Connected sites" onBack={back} />
      <div className="screen">
        {sites?.filter((s) => s.evmAccounts.length || s.solanaAccount).length === 0 && (
          <div className="empty">
            <Icon name="globe" size={28} />
            No sites are connected.
          </div>
        )}
        {sites && (
          <div className="card flush">
            {sites
              .filter((s) => s.evmAccounts.length || s.solanaAccount)
              .map((s) => (
                <div key={s.origin} className="list-item static">
                  <SiteIcon origin={s.origin} />
                  <div className="grow col" style={{ gap: 0, minWidth: 0 }}>
                    <span className="ellipsis" style={{ fontWeight: 650 }}>
                      {siteHost(s.origin)}
                    </span>
                    <span className="small muted">
                      {[s.evmAccounts.length && `EVM ×${s.evmAccounts.length}`, s.solanaAccount && "Solana"].filter(Boolean).join(" · ")} ·{" "}
                      {timeAgo(s.connectedAt)}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    className="sm"
                    onClick={async () => {
                      await call("disconnectSite", { origin: s.origin });
                      load();
                    }}
                  >
                    Disconnect
                  </Button>
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
}

export function SecuritySettings() {
  const { state, refresh } = useApp();
  const { back, go } = useRouter();
  if (!state) return null;
  return (
    <>
      <TopBar title="Security & privacy" onBack={back} />
      <div className="screen">
        <div className="card row between">
          <div className="col" style={{ gap: 0 }}>
            <span>Auto-lock</span>
            <span className="small muted">Lock after this long without use</span>
          </div>
          <select
            className="select"
            value={state.settings.autoLockMinutes}
            onChange={async (e) => {
              await call("updateSettings", { autoLockMinutes: Number(e.target.value) });
              await refresh();
            }}
          >
            {[1, 5, 15, 30, 60, 240].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </option>
            ))}
          </select>
        </div>
        <div className="card flush">
          <button className="list-item" onClick={() => go({ name: "settings.reveal" })}>
            <Icon name="key" />
            <span className="grow">Show recovery phrase</span>
            <Icon name="chevron" size={16} />
          </button>
          <button className="list-item" onClick={() => go({ name: "settings.password" })}>
            <Icon name="lock" />
            <span className="grow">Change password</span>
            <Icon name="chevron" size={16} />
          </button>
          <button className="list-item" onClick={() => go({ name: "settings.reset" })} style={{ color: "var(--error)" }}>
            <Icon name="trash" />
            <span className="grow">Remove wallet from this browser</span>
            <Icon name="chevron" size={16} />
          </button>
        </div>
        <Banner kind="info">
          Rizon keeps your keys encrypted on this computer. Every website request needs your approval, and look-alike scam domains are flagged before you sign.
        </Banner>
      </div>
    </>
  );
}

export function RevealPhrase() {
  const { back } = useRouter();
  const [pw, setPw] = useState("");
  const [phrase, setPhrase] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <TopBar title="Recovery phrase" onBack={back} />
      <div className="screen">
        <Banner kind="danger">Anyone with this phrase can take everything in your wallet. Never type it into a website.</Banner>
        {!phrase ? (
          <form
            className="col"
            style={{ gap: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr("");
              try {
                setPhrase(await call<string>("revealMnemonic", { password: pw }));
              } catch (e: any) {
                setErr(/Incorrect/.test(e.message) ? "Incorrect password" : e.message);
              } finally {
                setBusy(false);
                setPw("");
              }
            }}
          >
            <div className="field">
              <label htmlFor="rp">Enter your password to continue</label>
              <input id="rp" className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            </div>
            {err && <Banner kind="danger">{err}</Banner>}
            <Button type="submit" loading={busy} disabled={!pw}>
              Show phrase
            </Button>
          </form>
        ) : (
          <>
            <div className="reveal-wrap">
              <div className={`phrase-grid ${shown ? "" : "blurred"}`}>
                {phrase.split(" ").map((w, i) => (
                  <div className="phrase-word" key={i}>
                    <span className="n">{i + 1}</span>
                    {w}
                  </div>
                ))}
              </div>
              {!shown && (
                <div className="reveal-cover">
                  <Button variant="secondary" onClick={() => setShown(true)}>
                    <Icon name="eye" /> Hold on — reveal
                  </Button>
                </div>
              )}
            </div>
            <Button variant="secondary" onClick={() => setPhrase(null)}>
              Hide
            </Button>
          </>
        )}
      </div>
    </>
  );
}

export function ChangePassword() {
  const { back } = useRouter();
  const toast = useToast();
  const [oldPw, setOld] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = oldPw && pw.length >= 8 && pw === pw2;
  return (
    <>
      <TopBar title="Change password" onBack={back} />
      <form
        className="screen"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          setErr("");
          try {
            await call("changePassword", { oldPassword: oldPw, newPassword: pw });
            toast("Password changed");
            back();
          } catch (e: any) {
            setErr(/Incorrect/.test(e.message) ? "Current password is incorrect" : e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="op">Current password</label>
          <input id="op" className="input" type="password" value={oldPw} onChange={(e) => setOld(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="np">New password (8+ characters)</label>
          <input id="np" className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="np2">Confirm new password</label>
          <input id="np2" className={`input ${pw2 && pw2 !== pw ? "error" : ""}`} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {err && <Banner kind="danger">{err}</Banner>}
        <div style={{ flex: 1 }} />
        <Button type="submit" disabled={!valid} loading={busy}>
          Change password
        </Button>
      </form>
    </>
  );
}

export function ResetWallet() {
  const { back } = useRouter();
  const { refresh } = useApp();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <TopBar title="Remove wallet" onBack={back} />
      <div className="screen">
        <Banner kind="danger">
          This deletes your wallet from this browser. Your funds stay on the blockchain, but <strong>you'll need your recovery phrase</strong> to get back in.
          Without it, your funds are lost.
        </Banner>
        <div className="field">
          <label htmlFor="rs">Type RESET to confirm</label>
          <input id="rs" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </div>
        <div style={{ flex: 1 }} />
        <Button
          variant="danger"
          disabled={confirm !== "RESET"}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await call("resetWallet", { confirm });
            await refresh();
          }}
        >
          Remove wallet
        </Button>
      </div>
    </>
  );
}

export function PreferencesSettings() {
  const { state, refresh } = useApp();
  const { back } = useRouter();
  if (!state) return null;
  const set = async (patch: Partial<SettingsT>) => {
    await call("updateSettings", patch);
    await refresh();
  };
  return (
    <>
      <TopBar title="Preferences" onBack={back} />
      <div className="screen">
        <div className="card row between">
          <span>Theme</span>
          <select className="select" value={state.settings.theme} onChange={(e) => set({ theme: e.target.value as SettingsT["theme"] })}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="card row between">
          <div className="col" style={{ gap: 0 }}>
            <span>Hide small balances</span>
            <span className="small muted">Tokens worth less than $0.01</span>
          </div>
          <Toggle label="Hide small balances" checked={state.settings.hideSmallBalances} onChange={(v) => set({ hideSmallBalances: v })} />
        </div>
      </div>
    </>
  );
}

/* ------------------------------- @username ------------------------------- */

export function UsernameSettings() {
  const { account } = useApp();
  const { back } = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState<Identity | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [check, setCheck] = useState<{ available: boolean; reason?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (account) identityByAddress(account.evm).then(setCurrent).catch(() => setCurrent(null));
  }, [account?.evm]);

  const clean = name.trim().replace(/^@/, "").toLowerCase();
  useEffect(() => {
    setCheck(null);
    if (!account || !USERNAME_RE.test(clean)) return;
    const t = setTimeout(() => checkUsername(clean, account.evm).then(setCheck).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [clean, account?.evm]);

  if (!account) return null;
  return (
    <>
      <TopBar title="Username" onBack={back} />
      <div className="screen">
        {current === undefined && <div className="skeleton" style={{ height: 64 }} />}
        {current && (
          <div className="card col" style={{ alignItems: "center", textAlign: "center", gap: 6 }}>
            <Avatar seed={account.evm} label={current.username.slice(0, 1).toUpperCase()} size={48} />
            <strong style={{ fontSize: 18 }}>@{current.username}</strong>
            <span className="small muted">Linked to {account.name}. People can send to @{current.username} on any network from Rizon.</span>
          </div>
        )}
        {current === null && (
          <>
            <p className="p">Claim a username so friends can pay you as @name instead of a long address — on phone and desktop.</p>
            <div className="field">
              <label htmlFor="un">Username</label>
              <div className="input-wrap">
                <input id="un" className="input" placeholder="yourname" value={name} onChange={(e) => setName(e.target.value)} maxLength={21} autoComplete="off" spellCheck={false} />
              </div>
              {name && !USERNAME_RE.test(clean) && <span className="small muted">3–20 characters: letters, numbers and _</span>}
              {check && (check.available ? <span className="small up">@{clean} is available</span> : <span className="error-text">{check.reason ?? "Not available"}</span>)}
            </div>
            <Banner kind="info">Linking signs a free message with this account's EVM and Solana keys to prove you own both. Nothing is sent on-chain.</Banner>
            {err && <Banner kind="danger">{err}</Banner>}
            <div style={{ flex: 1 }} />
            <Button
              disabled={!check?.available}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setErr("");
                try {
                  setCurrent(await call<Identity>("linkUsername", { username: clean }));
                  toast(`You're @${clean}`);
                } catch (e: any) {
                  setErr(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Claim @{clean || "username"}
            </Button>
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------ cloud backup ------------------------------ */

export function BackupSettings() {
  const { back } = useRouter();
  const toast = useToast();
  const [info, setInfo] = useState<{ status: any; redirectUri: string } | null>(null);
  const [busy, setBusy] = useState<"" | "backup" | "delete">("");
  const [err, setErr] = useState("");
  const load = () => call("cloudStatus").then(setInfo);
  useEffect(() => {
    load();
  }, []);
  const run = async (kind: "backup" | "delete") => {
    setBusy(kind);
    setErr("");
    try {
      await call(kind === "backup" ? "cloudBackup" : "cloudDelete");
      toast(kind === "backup" ? "Backed up to Google Drive" : "Backup deleted");
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };
  const st = info?.status;
  return (
    <>
      <TopBar title="Cloud backup" onBack={back} />
      <div className="screen">
        <p className="p">
          Save an encrypted copy of your recovery phrase to your Google Drive. It's the same backup the Rizon phone app uses, so you can restore on either.
        </p>
        <div className="card">
          <Kv k="Status">{st ? <span className="pill ok">Backed up</span> : <span className="pill">Not backed up here</span>}</Kv>
          {st?.email && <Kv k="Google account">{st.email}</Kv>}
          {st?.backedUpAt && <Kv k="Last backup">{new Date(st.backedUpAt).toLocaleString()}</Kv>}
        </div>
        <Banner kind="info">
          The phrase is encrypted with a random key kept in your Rizon account; Drive only ever holds ciphertext, in a hidden folder Rizon can't see beyond. Anyone who controls your Google
          account could restore it, so protect that account with 2-step verification.
        </Banner>
        {err && (
          <Banner kind="danger">
            {err}
            {/redirect_uri|sign-in failed/i.test(err) && info && (
              <div className="mono" style={{ marginTop: 6 }}>
                {info.redirectUri}
              </div>
            )}
          </Banner>
        )}
        <div style={{ flex: 1 }} />
        <Button onClick={() => run("backup")} loading={busy === "backup"} disabled={!!busy}>
          {st ? "Back up again" : "Back up to Google Drive"}
        </Button>
        {st && (
          <Button variant="ghost" onClick={() => run("delete")} loading={busy === "delete"} disabled={!!busy}>
            Delete Drive backup
          </Button>
        )}
      </div>
    </>
  );
}
