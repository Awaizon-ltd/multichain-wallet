// Swap & bridge — same backend routes as the mobile app (hooks/useSwap.js):
//   same chain (EVM)    → /swap/price, then a fresh /swap/quote (0x)
//   same chain (Solana) → /swap/price, then a fresh /swap/quote (Jupiter)
//   different chains    → /bridge/quote (LI.FI: bridge + swap in one transaction)

import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnits } from "ethers";
import { API_BASE_URL, EVM_CHAINS, explorerTxUrl, getEvmChain, SOLANA, type NetworkId } from "../../shared/chains";
import { call, onUiEvent } from "../api";
import { Banner, Button, Icon, Kv, Sheet, TokenIcon, TopBar } from "../components/ui";
import { formatAmount, formatUsd, parseAmount } from "../format";
import type { Asset } from "../portfolio";
import { useApp, useRouter } from "../state";
import { AssetRow } from "./Home";

const NATIVE_EVM = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const SLIPPAGES = [0.005, 0.01, 0.03];

interface SwapToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  isNative?: boolean;
}

const networkName = (n: NetworkId) => (n === "SOLANA" ? SOLANA.name : getEvmChain(n)?.name ?? String(n));
const networkIcon = (n: NetworkId) => (n === "SOLANA" ? SOLANA.icon : getEvmChain(n)?.icon);

async function apiGet(path: string, params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  const r = await fetch(`${API_BASE_URL}${path}?${qs}`);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.success) throw new Error(j?.error || j?.message || `Request failed (${r.status})`);
  return j.data;
}

async function swapTokens(network: NetworkId): Promise<SwapToken[]> {
  const key = `swaptokens:${network}`;
  const hit = (await chrome.storage.local.get(key))[key] as { ts: number; v: SwapToken[] } | undefined;
  if (hit && Date.now() - hit.ts < 24 * 3600_000) return hit.v;
  const data = await apiGet("/swap/tokens", { chainId: network });
  const v: SwapToken[] = (data?.tokens ?? []).map((t: any) => ({ ...t, decimals: Number(t.decimals) }));
  await chrome.storage.local.set({ [key]: { ts: Date.now(), v } });
  return v;
}

/** Address the backend expects for an asset (native EVM = 0xEeee…, native SOL = wSOL mint). */
const sellAddress = (a: Asset) => (a.address ? a.address : a.network === "SOLANA" ? SOLANA.nativeMint : NATIVE_EVM);

export function Swap() {
  const { route, back } = useRouter();
  const { account, state } = useApp();
  const owned: Asset[] = (route.params?.assets ?? []).filter((a: Asset) => BigInt(a.balance) > 0n);
  const [sell, setSell] = useState<Asset | undefined>(owned[0]);
  const [amountStr, setAmountStr] = useState("");
  const [buyNetwork, setBuyNetwork] = useState<NetworkId>(owned[0]?.network ?? 8453);
  const [buyList, setBuyList] = useState<SwapToken[]>([]);
  const [buy, setBuy] = useState<SwapToken | undefined>();
  const [slippage, setSlippage] = useState(0.01);
  const [quote, setQuote] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);
  const [err, setErr] = useState("");
  const [picker, setPicker] = useState<"sell" | "buy" | "network" | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState<{ hash: string; network: NetworkId } | null>(null);
  const seq = useRef(0);

  const crossChain = !!sell && sell.network !== buyNetwork;
  const sellAmount = useMemo(() => {
    if (!sell || !amountStr) return null;
    try {
      return parseAmount(amountStr, sell.decimals);
    } catch {
      return null;
    }
  }, [sell, amountStr]);
  const overBalance = !!sell && sellAmount !== null && sellAmount > BigInt(sell.balance);

  // Destination token list.
  useEffect(() => {
    let live = true;
    swapTokens(buyNetwork)
      .then((l) => {
        if (!live) return;
        setBuyList(l);
        setBuy((cur) => {
          if (cur && l.some((t) => t.address === cur.address)) return cur;
          const usdc = l.find((t) => t.symbol === "USDC");
          const native = l.find((t) => t.isNative);
          const pick = usdc && sellAddress(sell!) !== usdc.address ? usdc : native;
          return pick ?? l[0];
        });
      })
      .catch(() => live && setBuyList([]));
    return () => {
      live = false;
    };
  }, [buyNetwork]);

  useEffect(() => onUiEvent((t) => t.startsWith("swap:") && setProgress(t.slice(5))), []);

  const destAddress = buyNetwork === "SOLANA" ? account?.solana : account?.evm;
  const fromAddress = sell?.network === "SOLANA" ? account?.solana : account?.evm;

  function request(firm: boolean) {
    if (!sell || !buy || !sellAmount) throw new Error("Choose tokens and an amount");
    if (crossChain) {
      return apiGet("/bridge/quote", {
        fromChain: sell.network,
        toChain: buyNetwork,
        fromToken: sellAddress(sell),
        toToken: buy.address,
        fromAmount: sellAmount.toString(),
        fromAddress,
        toAddress: destAddress,
        slippage,
      });
    }
    return apiGet(firm ? "/swap/quote" : "/swap/price", {
      chainId: sell.network,
      sellToken: sellAddress(sell),
      buyToken: buy.address,
      sellAmount: sellAmount.toString(),
      slippagePercentage: slippage,
      taker: fromAddress,
      takerAddress: fromAddress,
    });
  }

  // Indicative quote, debounced.
  useEffect(() => {
    setQuote(null);
    setErr("");
    if (!sell || !buy || !sellAmount || sellAmount <= 0n || overBalance) return;
    if (!crossChain && sellAddress(sell).toLowerCase() === buy.address.toLowerCase()) {
      setErr("Pick two different tokens");
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setQuoting(true);
      try {
        const q = await request(false);
        if (id === seq.current) setQuote(q);
      } catch (e: any) {
        if (id === seq.current) setErr(e.message);
      } finally {
        if (id === seq.current) setQuoting(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [sell?.key, buy?.address, buyNetwork, sellAmount?.toString(), slippage]);

  if (!account || !state) return null;

  if (done) {
    return (
      <>
        <TopBar title={crossChain ? "Bridge sent" : "Swap sent"} />
        <div className="screen center" style={{ alignItems: "center", textAlign: "center", gap: 14 }}>
          <div className="action">
            <span className="circle" style={{ width: 64, height: 64 }}>
              <Icon name="check" size={30} />
            </span>
          </div>
          <h1 className="h2">Submitted</h1>
          <p className="p">
            {crossChain
              ? `Bridging usually takes ${quote?.estimatedDurationSeconds ? `about ${Math.ceil(quote.estimatedDurationSeconds / 60)} min` : "a few minutes"}. Funds arrive on ${networkName(buyNetwork)}.`
              : "Your swap is on its way. Balances update once it confirms."}
          </p>
          <a className="btn secondary" href={explorerTxUrl(done.network, done.hash)} target="_blank" rel="noreferrer">
            View on explorer <Icon name="external" size={14} />
          </a>
          <Button className="block" onClick={back}>
            Done
          </Button>
        </div>
      </>
    );
  }

  if (owned.length === 0 || !sell) {
    return (
      <>
        <TopBar title="Swap" onBack={back} />
        <div className="empty">
          <Icon name="swap" size={28} />
          You need some crypto to swap. Receive some first.
        </div>
      </>
    );
  }

  const buyDecimals = buy?.decimals ?? 18;
  const receive = quote?.buyAmount ? formatAmount(quote.buyAmount, buyDecimals) : "";
  const minReceive = quote?.buyAmountMin ?? quote?.minBuyAmount;
  const impact = quote?.estimatedPriceImpact ?? quote?.priceImpactPercentage;
  const impactNum = impact != null ? Number(impact) : undefined;
  const route_ = crossChain ? quote?.toolDetails?.name ?? quote?.tool : quote?.route?.fills?.[0]?.source ?? (sell.network === "SOLANA" ? "Jupiter" : "0x");
  const sellUsd = sellAmount !== null && sell.price !== undefined ? (Number(sellAmount) / 10 ** sell.decimals) * sell.price : undefined;

  async function onMax() {
    const reserve = sell!.address ? 0n : sell!.network === "SOLANA" ? 10_000_000n : 2_000_000_000_000_000n; // 0.01 SOL / 0.002 native, like mobile
    const left = BigInt(sell!.balance) - reserve;
    setAmountStr(left > 0n ? formatUnits(left, sell!.decimals).replace(/\.0$/, "") : "0");
  }

  async function confirm() {
    if (!sell || !buy || !sellAmount) return;
    setBusy(true);
    setErr("");
    setProgress("Getting a fresh quote…");
    try {
      const firm = await request(true);
      const summary = `${crossChain ? "Bridged" : "Swapped"} ${formatAmount(sellAmount, sell.decimals)} ${sell.symbol} → ${buy.symbol}`;
      let result: { hash: string };
      if (firm?.transaction?.chainType === "solana") {
        result = await call("swapSolana", { serialized: firm.transaction.serialized, summary, crossChain });
      } else {
        result = await call("swapEvm", {
          chainId: sell.network,
          sellToken: { address: sellAddress(sell), isNative: !sell.address, symbol: sell.symbol },
          buyToken: { address: buy.address, symbol: buy.symbol },
          sellAmount: sellAmount.toString(),
          quote: firm,
          crossChain,
          summary,
        });
      }
      setQuote(firm);
      setDone({ hash: result.hash, network: sell.network });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  const canSwap = !!quote && !quoting && !overBalance && !busy && sellAmount !== null && sellAmount > 0n;

  return (
    <>
      <TopBar title={crossChain ? "Bridge" : "Swap"} onBack={back} />
      <div className="screen">
        {/* sell */}
        <div className="card col" style={{ gap: 8 }}>
          <div className="row between small muted">
            <span>You pay</span>
            <span>
              Balance {formatAmount(sell.balance, sell.decimals)}{" "}
              <button className="btn ghost sm" style={{ height: 22, padding: "0 6px" }} onClick={onMax}>
                Max
              </button>
            </span>
          </div>
          <div className="row">
            <input
              className="input"
              style={{ fontSize: 22, fontWeight: 700, border: 0, padding: 0, height: 36, background: "none", boxShadow: "none" }}
              inputMode="decimal"
              placeholder="0"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              aria-label="Amount to sell"
            />
            <button className="account-chip" onClick={() => setPicker("sell")}>
              <TokenIcon src={sell.logo} symbol={sell.symbol} chainIcon={sell.chainIcon} />
              <strong>{sell.symbol}</strong>
              <Icon name="down" size={14} />
            </button>
          </div>
          <div className="small muted">
            {sell.chainName}
            {sellUsd !== undefined && ` · ${formatUsd(sellUsd)}`}
          </div>
          {overBalance && <span className="error-text">More than your balance</span>}
        </div>

        {/* buy */}
        <div className="card col" style={{ gap: 8 }}>
          <div className="row between small muted">
            <span>You receive</span>
            <button className="account-chip" style={{ padding: "2px 8px" }} onClick={() => setPicker("network")}>
              {networkIcon(buyNetwork) && <img src={networkIcon(buyNetwork)} alt="" style={{ width: 16, height: 16, borderRadius: "50%" }} />}
              <span className="small">{networkName(buyNetwork)}</span>
              <Icon name="down" size={12} />
            </button>
          </div>
          <div className="row">
            <div className="grow" style={{ fontSize: 22, fontWeight: 700, minHeight: 36, display: "flex", alignItems: "center" }}>
              {quoting ? <span className="skeleton" style={{ height: 24, width: 120 }} /> : receive || <span className="muted">0</span>}
            </div>
            <button className="account-chip" onClick={() => setPicker("buy")} disabled={!buyList.length}>
              {buy ? <TokenIcon src={buy.logoURI} symbol={buy.symbol} /> : null}
              <strong>{buy?.symbol ?? "Select"}</strong>
              <Icon name="down" size={14} />
            </button>
          </div>
        </div>

        <div className="row between small">
          <span className="muted">Max slippage</span>
          <div className="tabs" style={{ width: 170 }}>
            {SLIPPAGES.map((s) => (
              <button key={s} className={slippage === s ? "active" : ""} onClick={() => setSlippage(s)}>
                {s * 100}%
              </button>
            ))}
          </div>
        </div>

        {quote && (
          <div className="card">
            {minReceive && (
              <Kv k="Minimum received">
                {formatAmount(minReceive, buyDecimals)} {buy?.symbol}
              </Kv>
            )}
            {impactNum !== undefined && Number.isFinite(impactNum) && (
              <Kv k="Price impact">
                <span className={impactNum > 3 ? "down" : ""}>{impactNum.toFixed(2)}%</span>
              </Kv>
            )}
            {route_ && <Kv k="Route">{String(route_)}</Kv>}
            {crossChain && quote.estimatedDurationSeconds && <Kv k="Estimated time">~{Math.ceil(quote.estimatedDurationSeconds / 60)} min</Kv>}
            {crossChain && quote.gasCostUsd && <Kv k="Network fee">≈ {formatUsd(Number(quote.gasCostUsd))}</Kv>}
            {crossChain && Number(quote.feeCostUsd) > 0 && <Kv k="Bridge fee">≈ {formatUsd(Number(quote.feeCostUsd))}</Kv>}
            {!sell.address ? null : <Kv k="Approval">{sell.symbol} for this amount only</Kv>}
          </div>
        )}
        {impactNum !== undefined && impactNum > 5 && <Banner kind="danger">High price impact: you'd lose about {impactNum.toFixed(1)}% to slippage on this trade.</Banner>}
        {crossChain && <Banner kind="info">Bridging to {networkName(buyNetwork)} — funds arrive at your Rizon {buyNetwork === "SOLANA" ? "Solana" : "EVM"} address.</Banner>}
        {err && <Banner kind="danger">{err}</Banner>}
        {progress && (
          <div className="row small muted">
            <span className="spinner" /> {progress}
          </div>
        )}
      </div>
      <div className="footer">
        <Button onClick={confirm} disabled={!canSwap} loading={busy}>
          {crossChain ? "Bridge" : "Swap"}
        </Button>
      </div>

      {picker === "sell" && (
        <Sheet title="You pay" onClose={() => setPicker(null)}>
          <div className="card flush" style={{ margin: "0 8px" }}>
            {owned.map((a) => (
              <AssetRow
                key={a.key}
                a={a}
                onClick={() => {
                  setSell(a);
                  setAmountStr("");
                  if (a.network !== sell.network && buyNetwork === sell.network) setBuyNetwork(a.network);
                  setPicker(null);
                }}
              />
            ))}
          </div>
        </Sheet>
      )}
      {picker === "network" && (
        <Sheet title="Receive on" onClose={() => setPicker(null)}>
          <div className="card flush" style={{ margin: "0 8px" }}>
            {[SOLANA.id as NetworkId, ...EVM_CHAINS.filter((c) => !c.testnet).map((c) => c.id as NetworkId)].map((n) => (
              <button
                key={String(n)}
                className="list-item"
                onClick={() => {
                  setBuyNetwork(n);
                  setPicker(null);
                }}
              >
                <div className="token-icon">{networkIcon(n) && <img src={networkIcon(n)} alt="" />}</div>
                <span className="grow">{networkName(n)}</span>
                {n === sell.network && <span className="pill">Same network</span>}
                {n === buyNetwork && <Icon name="check" />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {picker === "buy" && <TokenPicker list={buyList} onPick={(t) => (setBuy(t), setPicker(null))} onClose={() => setPicker(null)} />}
    </>
  );
}

function TokenPicker({ list, onPick, onClose }: { list: SwapToken[]; onPick: (t: SwapToken) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const l = s ? list.filter((t) => t.symbol.toLowerCase().includes(s) || t.name?.toLowerCase().includes(s) || t.address.toLowerCase() === s) : list;
    return l.slice(0, 100);
  }, [q, list]);
  return (
    <Sheet title="You receive" onClose={onClose}>
      <div style={{ padding: "0 8px 8px" }}>
        <input className="input" placeholder="Search name, symbol or paste address" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="card flush" style={{ margin: "0 8px" }}>
        {shown.map((t) => (
          <button key={t.address} className="list-item" onClick={() => onPick(t)}>
            <TokenIcon src={t.logoURI} symbol={t.symbol} />
            <div className="grow col" style={{ gap: 0, minWidth: 0 }}>
              <strong>{t.symbol}</strong>
              <span className="small muted ellipsis">{t.name}</span>
            </div>
          </button>
        ))}
        {shown.length === 0 && <div className="empty">No tokens match</div>}
      </div>
    </Sheet>
  );
}
