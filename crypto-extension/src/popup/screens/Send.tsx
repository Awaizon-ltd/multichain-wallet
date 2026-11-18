import { useMemo, useState } from "react";
import { Interface, formatUnits, getAddress, isAddress } from "ethers";
import { explorerTxUrl, getEvmChain } from "../../shared/chains";
import { b58decode } from "../../shared/base58";
import { call } from "../api";
import { Banner, Button, Icon, Kv, TokenIcon, TopBar } from "../components/ui";
import { formatAmount, formatFee, formatUsd, parseAmount, shortAddress } from "../format";
import type { Asset } from "../portfolio";
import { useApp, useRouter } from "../state";
import { AssetRow } from "./Home";
import { resolveRecipient } from "../recipient";

const erc20 = new Interface(["function transfer(address to, uint256 amount) returns (bool)"]);

function validateRecipient(asset: Asset, to: string): string | null {
  const v = to.trim();
  if (!v) return "Enter a recipient address";
  if (asset.network === "SOLANA") {
    try {
      if (b58decode(v).length !== 32) return "That isn't a Solana address";
    } catch {
      return "That isn't a Solana address";
    }
    return null;
  }
  if (!isAddress(v)) return "That isn't a valid address";
  try {
    getAddress(v);
  } catch {
    return "Address checksum is wrong — check for a typo";
  }
  return null;
}

type Review =
  | { kind: "evm"; preview: any; amount: bigint; to: string; username?: string }
  | { kind: "solana"; preview: any; amount: bigint; to: string; username?: string };

export function Send() {
  const { route, back } = useRouter();
  const { account } = useApp();
  const assets: Asset[] = (route.params?.assets ?? []).filter((a: Asset) => BigInt(a.balance) > 0n);
  const [asset, setAsset] = useState<Asset | undefined>(route.params?.asset && BigInt(route.params.asset.balance) > 0n ? route.params.asset : undefined);
  const [to, setTo] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [sent, setSent] = useState<{ hash: string; network: Asset["network"] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const amount = useMemo(() => {
    if (!asset || !amountStr) return null;
    try {
      return parseAmount(amountStr, asset.decimals);
    } catch {
      return null;
    }
  }, [asset, amountStr]);

  if (!account) return null;

  if (sent) {
    return (
      <>
        <TopBar title="Sent" />
        <div className="screen center" style={{ alignItems: "center", textAlign: "center", gap: 14 }}>
          <div className="action">
            <span className="circle" style={{ width: 64, height: 64 }}>
              <Icon name="check" size={30} />
            </span>
          </div>
          <h1 className="h2">Transaction submitted</h1>
          <p className="p">It usually confirms within a minute. You can follow it in Activity.</p>
          <a className="btn secondary" href={explorerTxUrl(sent.network, sent.hash)} target="_blank" rel="noreferrer">
            View on explorer <Icon name="external" size={14} />
          </a>
          <Button className="block" onClick={back}>
            Done
          </Button>
        </div>
      </>
    );
  }

  if (!asset) {
    return (
      <>
        <TopBar title="Send" onBack={back} />
        <div className="screen">
          <div className="section-title">Choose an asset</div>
          {assets.length === 0 ? (
            <div className="empty">
              <Icon name="info" size={28} />
              Nothing to send yet. Receive some crypto first.
            </div>
          ) : (
            <div className="card flush">
              {assets.map((a) => (
                <AssetRow key={a.key} a={a} onClick={() => setAsset(a)} />
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  // "@name" (or a bare name that isn't an address) is resolved on Review.
  const maybeUsername = to.trim().startsWith("@") || /^[a-zA-Z0-9_]{3,20}$/.test(to.trim());
  const recipientError = to && !maybeUsername ? validateRecipient(asset, to) : null;
  const balance = BigInt(asset.balance);
  const overBalance = amount !== null && amount > balance;
  const ownAddress = asset.network === "SOLANA" ? account.solana : account.evm;
  const isSelf = to.trim().toLowerCase() === ownAddress.toLowerCase();
  const usdValue = amount !== null && asset.price !== undefined ? (Number(amount) / 10 ** asset.decimals) * asset.price : undefined;

  async function buildReview(value: bigint, recipient: string): Promise<Review> {
    if (asset!.network === "SOLANA") {
      const preview = await call("previewSolanaSend", { to: recipient, amount: value.toString(), mint: asset!.address });
      return { kind: "solana", preview, amount: value, to: recipient };
    }
    const chainId = asset!.network as number;
    const req = asset!.address
      ? { chainId, to: asset!.address, value: "0", data: erc20.encodeFunctionData("transfer", [recipient, value]) }
      : { chainId, to: recipient, value: value.toString(), data: "0x" };
    const preview = await call("prepareEvmTx", req);
    return { kind: "evm", preview, amount: value, to: recipient };
  }

  // Exact decimal string (no float rounding, which could exceed the balance).
  const exact = (v: bigint) => formatUnits(v, asset!.decimals).replace(/\.0$/, "");

  async function onMax() {
    setErr("");
    if (asset!.address) {
      setAmountStr(exact(balance));
      return;
    }
    // Native: leave room for the fee.
    if (asset!.network === "SOLANA") {
      const left = balance - 10_000n;
      setAmountStr(left > 0n ? exact(left) : "0");
      return;
    }
    if (!to.trim()) {
      setErr("Enter the recipient first so Rizon can work out the fee.");
      return;
    }
    setBusy(true);
    try {
      const resolved = await resolveRecipient("evm", to);
      const r = await buildReview(1n, resolved.address);
      const fee = BigInt(r.preview.maxFee);
      const left = balance > fee ? balance - fee : 0n;
      setAmountStr(exact(left));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (review) {
    const p = review.preview;
    const isSol = review.kind === "solana";
    const feeText = isSol
      ? `${((p.feeLamports + p.rentLamports) / 1e9).toFixed(6)} SOL`
      : `${formatFee(p.maxFeeFormatted)} ${p.nativeSymbol} (max)`;
    const blocked = isSol ? false : p.insufficientFunds;
    return (
      <>
        <TopBar title="Review" onBack={() => setReview(null)} />
        <div className="screen">
          <div className="hero">
            <TokenIcon src={asset.logo} symbol={asset.symbol} />
            <div className="balance" style={{ fontSize: 26, marginTop: 8 }}>
              {formatAmount(review.amount, asset.decimals)} {asset.symbol}
            </div>
            {usdValue !== undefined && <div className="muted">{formatUsd(usdValue)}</div>}
          </div>
          <div className="card">
            <Kv k="From">{account.name}</Kv>
            <Kv k="To">
              {review.username && <strong>@{review.username} </strong>}
              <span className="mono">{shortAddress(review.to, 6)}</span>
            </Kv>
            <Kv k="Network">{asset.chainName}</Kv>
            <Kv k="Network fee">{feeText}</Kv>
            {isSol && p.createsRecipientAccount && <Kv k="Token account">Created for recipient (rent included)</Kv>}
          </div>
          {(p.warnings ?? []).map((w: string) => (
            <Banner key={w} kind={/fail|Not enough/.test(w) ? "danger" : "warning"}>
              {w}
            </Banner>
          ))}
          {err && <Banner kind="danger">{err}</Banner>}
        </div>
        <div className="footer">
          <Button variant="secondary" onClick={() => setReview(null)}>
            Back
          </Button>
          <Button
            loading={busy}
            disabled={blocked}
            onClick={async () => {
              setBusy(true);
              setErr("");
              try {
                const summary = `Sent ${formatAmount(review.amount, asset.decimals)} ${asset.symbol}`;
                const hash =
                  review.kind === "solana"
                    ? await call<string>("sendSolana", { to: review.to, amount: review.amount.toString(), mint: asset.address, summary })
                    : await call<string>("sendEvmTx", { tx: p.tx, recipient: review.to, summary });
                setSent({ hash, network: asset.network });
              } catch (e: any) {
                setErr(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm & send
          </Button>
        </div>
      </>
    );
  }

  const canReview = !!to && !recipientError && amount !== null && amount > 0n && !overBalance;
  return (
    <>
      <TopBar title={`Send ${asset.symbol}`} onBack={() => (route.params?.asset ? back() : setAsset(undefined))} />
      <form
        className="screen"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canReview) return;
          setBusy(true);
          setErr("");
          try {
            const r = await resolveRecipient(asset.network === "SOLANA" ? "solana" : "evm", to);
            if (r.address.toLowerCase() === ownAddress.toLowerCase() && r.username) throw new Error(`@${r.username} is you.`);
            setReview({ ...(await buildReview(amount!, r.address)), username: r.username });
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="card flush">
          <AssetRow a={asset} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input
            id="to"
            className={`input mono ${recipientError ? "error" : ""}`}
            placeholder={asset.network === "SOLANA" ? "Solana address or @username" : "0x… address or @username"}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          {recipientError && <span className="error-text">{recipientError}</span>}
          {!recipientError && isSelf && <span className="small" style={{ color: "var(--warning)" }}>This is your own address.</span>}
        </div>
        <div className="field">
          <label htmlFor="amt">Amount</label>
          <div className="input-wrap">
            <input
              id="amt"
              className={`input ${overBalance ? "error" : ""}`}
              inputMode="decimal"
              placeholder="0.0"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              autoComplete="off"
            />
            <button type="button" className="btn sm secondary suffix" onClick={onMax} disabled={busy}>
              Max
            </button>
          </div>
          <span className="small muted">
            Balance: {formatAmount(asset.balance, asset.decimals)} {asset.symbol}
            {usdValue !== undefined && ` · ≈ ${formatUsd(usdValue)}`}
          </span>
          {overBalance && <span className="error-text">More than your balance</span>}
          {amountStr && amount === null && <span className="error-text">Enter a valid amount</span>}
        </div>
        {asset.network !== "SOLANA" && getEvmChain(asset.network as number) && (
          <p className="tiny muted">Sending on {asset.chainName}. Make sure the recipient can receive on this network.</p>
        )}
        {err && <Banner kind="danger">{err}</Banner>}
        <div style={{ flex: 1 }} />
        <Button type="submit" className="block" disabled={!canReview} loading={busy}>
          Review
        </Button>
      </form>
    </>
  );
}
