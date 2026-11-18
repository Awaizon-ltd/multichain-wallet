import { useEffect, useMemo, useState } from "react";
import { Banner, Icon, Kv, TokenIcon, TopBar } from "../components/ui";
import { PriceChart, Sparkline } from "../components/PriceChart";
import { CHART_PERIODS, getChart, getCoin, getTrending, type MarketTab, type MarketToken } from "../data";
import { formatPct, formatPrice, formatUsd } from "../format";
import { useRouter } from "../state";

const compactUsd = (v?: number) =>
  v === undefined || v === null ? "—" : "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);

export function Market() {
  const { go } = useRouter();
  const [tabs, setTabs] = useState<MarketTab[] | null>(null);
  const [tab, setTab] = useState("trending");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    getTrending()
      .then((d) => setTabs(d.tabs))
      .catch((e) => setErr(e.message));
  }, []);

  const list = useMemo(() => {
    const t = tabs?.find((x) => x.key === tab) ?? tabs?.[0];
    const s = q.trim().toLowerCase();
    const all = s ? tabs?.find((x) => x.key === "all")?.tokens ?? t?.tokens ?? [] : t?.tokens ?? [];
    return s ? all.filter((c) => c.symbol.toLowerCase().includes(s) || c.name.toLowerCase().includes(s)) : all;
  }, [tabs, tab, q]);

  return (
    <>
      <TopBar title="Market" />
      <div className="screen">
        <input className="input" placeholder="Search tokens" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tokens" />
        {!q && tabs && (
          <div className="chips" role="tablist">
            {tabs
              .filter((t) => t.key !== "all")
              .map((t) => (
                <button key={t.key} role="tab" aria-selected={tab === t.key} className={`chip ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
          </div>
        )}
        {err && <Banner kind="danger">Market data is unavailable right now. {err}</Banner>}
        <div className="card flush">
          {!tabs &&
            !err &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="list-item static">
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
                <div className="grow skeleton" style={{ height: 14 }} />
              </div>
            ))}
          {list.slice(0, 100).map((c) => (
            <CoinRow key={c.id} c={c} onClick={() => go({ name: "coin", params: { id: c.id, token: c } })} />
          ))}
          {tabs && list.length === 0 && <div className="empty">No tokens match.</div>}
        </div>
        <p className="tiny muted" style={{ textAlign: "center" }}>
          Market data from CoinGecko via Rizon.
        </p>
      </div>
    </>
  );
}

function CoinRow({ c, onClick }: { c: MarketToken; onClick: () => void }) {
  return (
    <button className="list-item" onClick={onClick}>
      <TokenIcon src={c.image} symbol={c.symbol} />
      <div className="grow col" style={{ gap: 0, minWidth: 0 }}>
        <strong className="ellipsis">{c.symbol.toUpperCase()}</strong>
        <span className="small muted ellipsis">
          {c.rank ? `#${c.rank} · ` : ""}
          {compactUsd(c.marketCap)}
        </span>
      </div>
      <Sparkline values={c.sparkline} />
      <div className="col right" style={{ gap: 0, minWidth: 74 }}>
        <strong>{formatPrice(c.price)}</strong>
        {c.change24h != null && <span className={`small ${c.change24h >= 0 ? "up" : "down"}`}>{formatPct(c.change24h)}</span>}
      </div>
    </button>
  );
}

export function CoinDetail() {
  const { route, back } = useRouter();
  const id: string = route.params?.id;
  const seed: MarketToken | undefined = route.params?.token;
  const [coin, setCoin] = useState<any>(null);
  const [days, setDays] = useState(7);
  const [points, setPoints] = useState<[number, number][] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    getCoin(id).then(setCoin).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => {
    setPoints(null);
    getChart(id, days)
      .then(setPoints)
      .catch(() => setPoints([]));
  }, [id, days]);

  const m = coin?.market ?? {};
  const price = m.price ?? seed?.price;
  const change = m.change24h ?? seed?.change24h;
  const symbol = (coin?.symbol ?? seed?.symbol ?? "").toUpperCase();

  return (
    <>
      <TopBar title={coin?.name ?? seed?.name ?? "Token"} onBack={back} />
      <div className="screen">
        <div className="row">
          <TokenIcon src={coin?.image ?? seed?.image} symbol={symbol} />
          <div className="col" style={{ gap: 0 }}>
            <span style={{ fontSize: 24, fontWeight: 750 }}>{formatPrice(price)}</span>
            {change != null && (
              <span className={`small ${change >= 0 ? "up" : "down"}`}>
                {formatPct(change)} <span className="muted">24h</span>
              </span>
            )}
          </div>
        </div>
        <div className="tabs" role="tablist" aria-label="Chart period">
          {CHART_PERIODS.map((p) => (
            <button key={p.days} role="tab" aria-selected={days === p.days} className={days === p.days ? "active" : ""} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
        {points === null ? (
          <div className="skeleton" style={{ height: 180 }} />
        ) : points.length < 2 ? (
          <div className="empty">No chart data.</div>
        ) : (
          <PriceChart points={points} days={days} label={symbol} />
        )}
        {err && <Banner>{err}</Banner>}
        {coin && (
          <div className="card">
            <Kv k="Market cap">{compactUsd(m.marketCap)}</Kv>
            <Kv k="24h volume">{compactUsd(m.volume24h)}</Kv>
            {m.rank && <Kv k="Rank">#{m.rank}</Kv>}
            {m.high24h != null && (
              <Kv k="24h range">
                {formatPrice(m.low24h)} – {formatPrice(m.high24h)}
              </Kv>
            )}
            {m.change7d != null && <Kv k="7 days">{formatPct(m.change7d)}</Kv>}
            {m.ath != null && (
              <Kv k="All-time high">
                {formatUsd(m.ath)} <span className="muted">({formatPct(m.athChange)})</span>
              </Kv>
            )}
          </div>
        )}
        {coin?.description && (
          <div className="card small" style={{ color: "var(--text-2)" }}>
            {String(coin.description).slice(0, 600)}
            {String(coin.description).length > 600 && "…"}
          </div>
        )}
        {coin?.links?.homepage && (
          <a className="btn secondary" href={coin.links.homepage} target="_blank" rel="noreferrer">
            Website <Icon name="external" size={14} />
          </a>
        )}
      </div>
    </>
  );
}
