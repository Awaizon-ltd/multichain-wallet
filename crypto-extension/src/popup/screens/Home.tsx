import { useCallback, useEffect, useMemo, useState } from "react";
import { call } from "../api";
import { Avatar, Banner, Icon, Sheet, TokenIcon, useCopy } from "../components/ui";
import { formatAmount, formatPct, formatUsd, shortAddress } from "../format";
import { cachedPortfolio, loadPortfolio, type Asset } from "../portfolio";
import { useApp, useRouter } from "../state";
import { identityByAddress } from "../data";

export function Home() {
  const { state, account, refresh } = useApp();
  const { go } = useRouter();
  const copy = useCopy();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [picker, setPicker] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    setUsername(null);
    if (account) identityByAddress(account.evm).then((i) => setUsername(i?.username ?? null)).catch(() => {});
  }, [account?.evm]);

  const load = useCallback(async () => {
    if (!account || !state) return;
    setLoading(true);
    try {
      const r = await loadPortfolio(account, state.settings);
      setAssets(r.assets);
      setErrors(r.errors);
    } finally {
      setLoading(false);
    }
  }, [account?.evm, state?.settings]);

  useEffect(() => {
    if (!account) return;
    let live = true;
    cachedPortfolio(account).then((c) => live && c && setAssets(c));
    load();
    return () => {
      live = false;
    };
  }, [load]);

  const visible = useMemo(() => {
    if (!assets) return null;
    return assets.filter((a) => {
      if (!a.address) return true; // always show native balances of enabled networks
      if (state?.settings.hideSmallBalances && a.usd !== undefined && a.usd < 0.01) return false;
      return true;
    });
  }, [assets, state?.settings.hideSmallBalances]);

  const total = assets?.reduce((s, a) => s + (a.usd ?? 0), 0);
  const change = useMemo(() => {
    if (!assets || !total) return undefined;
    let prev = 0;
    for (const a of assets) if (a.usd && a.change24h != null) prev += a.usd / (1 + a.change24h / 100);
    else if (a.usd) prev += a.usd;
    return prev ? ((total - prev) / prev) * 100 : undefined;
  }, [assets, total]);

  if (!account || !state) return null;

  return (
    <>
      <div className="topbar">
        <button className="account-chip" onClick={() => setPicker(true)} aria-label="Switch account">
          <Avatar seed={account.evm} label={String(account.index + 1)} />
          <span className="col" style={{ gap: 0, alignItems: "flex-start", minWidth: 0 }}>
            <span className="small ellipsis" style={{ fontWeight: 650, maxWidth: 140 }}>
              {account.name}
            </span>
          </span>
          <Icon name="down" size={14} />
        </button>
        <span className="grow" />
        <button className="icon-btn" onClick={() => copy(account.evm, "EVM address copied")} title={account.evm} aria-label="Copy EVM address">
          <Icon name="copy" size={16} />
        </button>
        <button className="icon-btn" onClick={load} aria-label="Refresh" disabled={loading}>
          {loading ? <span className="spinner" /> : <Icon name="refresh" size={16} />}
        </button>
        <button
          className="icon-btn"
          aria-label="Lock"
          onClick={async () => {
            await call("lock");
            await refresh();
          }}
        >
          <Icon name="lock" size={16} />
        </button>
      </div>

      <div className="screen">
        <div className="hero">
          <div className="small muted">
            {username ? <strong style={{ color: "var(--text)" }}>@{username}</strong> : `${shortAddress(account.evm)} · ${shortAddress(account.solana)}`}
          </div>
          {total === undefined ? (
            <div className="skeleton" style={{ height: 40, width: 180, margin: "8px auto" }} />
          ) : (
            <div className="balance">{formatUsd(total)}</div>
          )}
          {change !== undefined && Number.isFinite(change) && (
            <div className={`small ${change >= 0 ? "up" : "down"}`}>{formatPct(change)} today</div>
          )}
        </div>

        <div className="actions">
          <button className="action" onClick={() => go({ name: "send", params: { assets: visible ?? [] } })} disabled={!visible}>
            <span className="circle">
              <Icon name="send" />
            </span>
            Send
          </button>
          <button className="action" onClick={() => go({ name: "receive" })}>
            <span className="circle">
              <Icon name="receive" />
            </span>
            Receive
          </button>
          <button className="action" onClick={() => go({ name: "swap", params: { assets: visible ?? [] } })} disabled={!visible}>
            <span className="circle">
              <Icon name="swap" />
            </span>
            Swap
          </button>
        </div>

        {state.pendingApprovals > 0 && (
          <button className="banner info" style={{ border: 0, cursor: "pointer", textAlign: "left" }} onClick={() => go({ name: "approvals" })}>
            <Icon name="shield" size={16} />
            <span className="grow">
              {state.pendingApprovals} request{state.pendingApprovals > 1 ? "s" : ""} waiting for your approval
            </span>
            <Icon name="chevron" size={16} />
          </button>
        )}
        {errors.length > 0 && <Banner>Couldn't load {errors.join(", ")}. Showing what's available.</Banner>}

        <div className="section-title">Assets</div>
        <div className="card flush">
          {!visible &&
            [0, 1, 2].map((i) => (
              <div className="list-item static" key={i}>
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
                <div className="grow col">
                  <div className="skeleton" style={{ height: 12, width: "50%" }} />
                  <div className="skeleton" style={{ height: 10, width: "30%" }} />
                </div>
              </div>
            ))}
          {visible?.map((a) => <AssetRow key={a.key} a={a} onClick={() => go({ name: "send", params: { assets: visible, asset: a } })} />)}
        </div>
        <p className="tiny muted" style={{ textAlign: "center" }}>
          Missing a network? Turn it on in Settings → Networks.
        </p>
      </div>

      {picker && <AccountPicker onClose={() => setPicker(false)} />}
    </>
  );
}

export function AssetRow({ a, onClick, right }: { a: Asset; onClick?: () => void; right?: React.ReactNode }) {
  const amount = formatAmount(a.balance, a.decimals);
  return (
    <button className={`list-item ${onClick ? "" : "static"}`} onClick={onClick}>
      <TokenIcon src={a.logo} symbol={a.symbol} chainIcon={a.address ? a.chainIcon : undefined} />
      <div className="grow col" style={{ gap: 0 }}>
        <span style={{ fontWeight: 650 }} className="ellipsis">
          {a.symbol}
        </span>
        <span className="small muted ellipsis">
          {a.chainName}
          {a.price !== undefined && ` · ${formatUsd(a.price)}`}
          {a.change24h != null && <span className={a.change24h >= 0 ? "up" : "down"}> {formatPct(a.change24h)}</span>}
        </span>
      </div>
      {right ?? (
        <div className="col right" style={{ gap: 0 }}>
          <span style={{ fontWeight: 650 }}>{a.usd !== undefined ? formatUsd(a.usd) : `${amount} ${a.symbol}`}</span>
          <span className="small muted">{a.usd !== undefined ? `${amount} ${a.symbol}` : "No price"}</span>
        </div>
      )}
    </button>
  );
}

function AccountPicker({ onClose }: { onClose: () => void }) {
  const { state, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  return (
    <Sheet title="Accounts" onClose={onClose}>
      <div className="card flush" style={{ margin: "0 8px" }}>
        {state.accounts.map((a) => (
          <button
            key={a.index}
            className="list-item"
            onClick={async () => {
              await call("selectAccount", { index: a.index });
              await refresh();
              onClose();
            }}
          >
            <Avatar seed={a.evm} label={String(a.index + 1)} />
            <div className="grow col" style={{ gap: 0 }}>
              <span style={{ fontWeight: 650 }}>{a.name}</span>
              <span className="small muted">
                {shortAddress(a.evm)} · {shortAddress(a.solana)}
              </span>
            </div>
            {a.index === state.selectedIndex && <Icon name="check" />}
          </button>
        ))}
      </div>
      <div style={{ padding: "12px 8px 4px" }}>
        <button
          className="btn secondary block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const acc = await call("addAccount", {});
              await call("selectAccount", { index: acc.index });
              await refresh();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="plus" size={16} /> Add account
        </button>
      </div>
    </Sheet>
  );
}
