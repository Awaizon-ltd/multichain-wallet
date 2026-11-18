import { useEffect, useMemo, useState } from "react";
import { Interface } from "ethers";
import { explorerTxUrl } from "../../shared/chains";
import { call } from "../api";
import { Banner, Button, Icon, Kv, TopBar } from "../components/ui";
import { loadNfts, type Nft } from "../data";
import { formatFee, shortAddress } from "../format";
import { resolveRecipient, type Resolved } from "../recipient";
import { useApp, useRouter } from "../state";

const nftIface = new Interface([
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
]);

function NftImage({ src, alt }: { src?: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
  ) : (
    <div className="nft-placeholder">
      <Icon name="globe" size={24} />
    </div>
  );
}

export function Nfts() {
  const { account, state } = useApp();
  const { go } = useRouter();
  const [nfts, setNfts] = useState<Nft[] | null>(null);
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    if (!account || !state) return;
    loadNfts(account.evm, state.settings).then((r) => {
      setNfts(r.nfts);
      setUnsupported(r.unsupported);
    });
  }, [account?.evm, state?.settings.enabledNetworks.join()]);

  const visible = useMemo(() => nfts?.filter((n) => !n.spam) ?? [], [nfts]);
  const hidden = useMemo(() => nfts?.filter((n) => n.spam) ?? [], [nfts]);
  const shown = showHidden ? hidden : visible;

  return (
    <>
      <TopBar title="NFTs" />
      <div className="screen">
        {nfts === null && (
          <div className="nft-grid">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ aspectRatio: "1", borderRadius: 12 }} />
            ))}
          </div>
        )}
        {nfts && shown.length === 0 && (
          <div className="empty">
            <Icon name="globe" size={28} />
            {showHidden ? "Nothing hidden." : "No NFTs on your enabled networks yet."}
          </div>
        )}
        {shown.length > 0 && (
          <div className="nft-grid">
            {shown.map((n) => (
              <button key={n.key} className="nft-card" onClick={() => go({ name: "nft", params: { nft: n } })}>
                <NftImage src={n.image} alt={n.name} />
                <div className="nft-meta">
                  <span className="small ellipsis" style={{ fontWeight: 650 }}>
                    {n.name}
                  </span>
                  <span className="tiny muted ellipsis">
                    {n.collection} · {n.chainName}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
        {nfts && hidden.length > 0 && (
          <button className="btn ghost" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? "Back to your NFTs" : `Show ${hidden.length} hidden (suspected spam)`}
          </button>
        )}
        {showHidden && (
          <Banner>
            These look like scam airdrops. Don't visit links in them or try to "claim" anything — that's how they steal funds.
          </Banner>
        )}
        {unsupported.length > 0 && <p className="tiny muted" style={{ textAlign: "center" }}>NFTs on {unsupported.join(", ")} aren't shown yet.</p>}
      </div>
    </>
  );
}

export function NftDetail() {
  const { route, back } = useRouter();
  const { account } = useApp();
  const n: Nft = route.params?.nft;
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("1");
  const [review, setReview] = useState<{ preview: any; recipient: Resolved; data: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  if (!account || !n) return null;

  if (sent) {
    return (
      <>
        <TopBar title="Sent" />
        <div className="screen center" style={{ alignItems: "center", textAlign: "center", gap: 14 }}>
          <h1 className="h2">NFT transfer submitted</h1>
          <a className="btn secondary" href={explorerTxUrl(n.chainId, sent)} target="_blank" rel="noreferrer">
            View on explorer <Icon name="external" size={14} />
          </a>
          <Button className="block" onClick={back}>
            Done
          </Button>
        </div>
      </>
    );
  }

  const prepare = async () => {
    setBusy(true);
    setErr("");
    try {
      const recipient = await resolveRecipient("evm", to);
      if (recipient.address.toLowerCase() === account.evm.toLowerCase()) throw new Error("That's your own address.");
      const qty = BigInt(amount || "0");
      if (n.standard === "ERC1155" && (qty <= 0n || qty > BigInt(n.balance))) throw new Error(`Enter an amount from 1 to ${n.balance}`);
      const data =
        n.standard === "ERC1155"
          ? nftIface.encodeFunctionData("safeTransferFrom(address,address,uint256,uint256,bytes)", [account.evm, recipient.address, n.tokenId, qty, "0x"])
          : nftIface.encodeFunctionData("safeTransferFrom(address,address,uint256)", [account.evm, recipient.address, n.tokenId]);
      const preview = await call("prepareEvmTx", { chainId: n.chainId, to: n.contract, value: "0", data });
      setReview({ preview, recipient, data });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title={n.name} onBack={review ? () => setReview(null) : back} />
      <div className="screen">
        <div className="nft-hero">
          <NftImage src={n.image} alt={n.name} />
        </div>
        {n.spam && <Banner kind="danger">Rizon thinks this is a scam airdrop. Don't follow any links in it.</Banner>}
        <div className="card">
          <Kv k="Collection">{n.collection}</Kv>
          <Kv k="Network">{n.chainName}</Kv>
          <Kv k="Token ID">
            <span className="mono">{n.tokenId.length > 16 ? shortAddress(n.tokenId, 6) : n.tokenId}</span>
          </Kv>
          <Kv k="Standard">{n.standard}</Kv>
          {n.standard === "ERC1155" && <Kv k="You own">{n.balance}</Kv>}
          <Kv k="Contract">
            <span className="mono">{shortAddress(n.contract, 6)}</span>
          </Kv>
        </div>
        {!review && !n.spam && (
          <>
            <div className="section-title">Send</div>
            <div className="field">
              <input className="input mono" placeholder="0x… address or @username" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} aria-label="Recipient" />
            </div>
            {n.standard === "ERC1155" && (
              <div className="field">
                <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} aria-label="Amount" />
              </div>
            )}
          </>
        )}
        {review && (
          <div className="card">
            <Kv k="To">
              {review.recipient.username && <strong>@{review.recipient.username} </strong>}
              <span className="mono muted">{shortAddress(review.recipient.address, 6)}</span>
            </Kv>
            <Kv k="Network fee">
              {formatFee(review.preview.maxFeeFormatted)} {review.preview.nativeSymbol} <span className="muted">max</span>
            </Kv>
          </div>
        )}
        {review?.preview.warnings?.filter((w: string) => !/approve/i.test(w)).map((w: string) => (
          <Banner key={w} kind="danger">
            {w}
          </Banner>
        ))}
        {err && <Banner kind="danger">{err}</Banner>}
      </div>
      {!n.spam && (
        <div className="footer">
          {!review ? (
            <Button onClick={prepare} loading={busy} disabled={!to.trim()}>
              Review transfer
            </Button>
          ) : (
            <Button
              loading={sending}
              disabled={review.preview.insufficientFunds}
              onClick={async () => {
                setSending(true);
                setErr("");
                try {
                  setSent(await call<string>("sendEvmTx", { tx: review.preview.tx, recipient: review.recipient.address, summary: `Sent ${n.name}` }));
                } catch (e: any) {
                  setErr(e.message);
                } finally {
                  setSending(false);
                }
              }}
            >
              Confirm & send
            </Button>
          )}
        </div>
      )}
    </>
  );
}
