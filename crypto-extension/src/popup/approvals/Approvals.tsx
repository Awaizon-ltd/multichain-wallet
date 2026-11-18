import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatUnits } from "ethers";
import { getEvmChain } from "../../shared/chains";
import type { Approval } from "../../shared/messages";
import { call, isPopupWindow, onUiEvent } from "../api";
import { Avatar, Banner, Button, Icon, Kv, SecurityNotice, SiteIcon, TopBar } from "../components/ui";
import { formatAmount, formatFee, shortAddress, siteHost } from "../format";
import { useApp } from "../state";
import { Unlock } from "../screens/Unlock";

export function Approvals({ onEmpty }: { onEmpty?: () => void }) {
  const { state } = useApp();
  const [list, setList] = useState<Approval[] | null>(null);

  useEffect(() => {
    const load = () => call<Approval[]>("listApprovals").then(setList);
    load();
    const off = onUiEvent((t) => t === "approvals" && load());
    // Keep the service worker alive while the user decides.
    const port = chrome.runtime.connect({ name: "rizon:keepalive" });
    const ping = setInterval(() => port.postMessage("ping"), 20_000);
    return () => {
      off();
      clearInterval(ping);
      port.disconnect();
    };
  }, []);

  useEffect(() => {
    if (list && list.length === 0) {
      if (isPopupWindow()) window.close();
      else onEmpty?.();
    }
  }, [list]);

  if (!list || !state) return null;
  const current = list[0];
  if (!current) return null;

  if (state.status !== "unlocked") {
    return <Unlock subtitle={`${siteHost(current.origin)} wants to use your wallet. Unlock to continue.`} />;
  }
  return <ApprovalView key={current.id} approval={current} queued={list.length - 1} />;
}

function ApprovalView({ approval, queued }: { approval: Approval; queued: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ack, setAck] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const d = approval.details;
  const highRisk = !!d.security?.isHighRisk;

  const decide = async (approve: boolean, result: unknown = {}) => {
    setBusy(true);
    setErr("");
    try {
      if (approve) await call("resolveApproval", { id: approval.id, result });
      else await call("rejectApproval", { id: approval.id });
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  // Unlock-only requests resolve themselves once unlocked.
  useEffect(() => {
    if (approval.kind === "unlock") decide(true);
  }, [approval.kind]);
  if (approval.kind === "unlock") return null;

  const body = <Body approval={approval} onSelection={setSelection} />;
  const custom = approval.kind === "connect" || approval.kind === "solanaConnect";
  const blocked = (highRisk && !ack) || (approval.kind === "sendTransaction" && d.preview?.insufficientFunds);

  return (
    <>
      <TopBar title={TITLES[approval.kind] ?? "Request"} right={queued > 0 ? <span className="pill">+{queued}</span> : undefined} />
      <div className="screen">
        <div className="row">
          <SiteIcon origin={approval.origin} />
          <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
            <strong className="ellipsis">{siteHost(approval.origin)}</strong>
            <span className="small muted ellipsis">{approval.origin}</span>
          </div>
        </div>
        <SecurityNotice verdict={d.security} />
        {body}
        {highRisk && (
          <label className="check small">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>I understand this site may be a scam and want to continue anyway.</span>
          </label>
        )}
        {err && <Banner kind="danger">{err}</Banner>}
      </div>
      {!custom && (
        <div className="footer">
          <Button variant="secondary" onClick={() => decide(false)} disabled={busy}>
            Reject
          </Button>
          <Button onClick={() => decide(true)} loading={busy} disabled={blocked}>
            {CONFIRM[approval.kind] ?? "Approve"}
          </Button>
        </div>
      )}
      {custom && (
        <div className="footer">
          <Button variant="secondary" onClick={() => decide(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={(highRisk && !ack) || selection.length === 0}
            onClick={() => decide(true, approval.kind === "connect" ? { accounts: selection } : { account: selection[0] })}
          >
            Connect
          </Button>
        </div>
      )}
    </>
  );
}

const TITLES: Record<string, string> = {
  connect: "Connect",
  solanaConnect: "Connect",
  personalSign: "Signature request",
  signTypedData: "Signature request",
  sendTransaction: "Confirm transaction",
  watchAsset: "Add token",
  solanaSignMessage: "Signature request",
  solanaSignTransaction: "Confirm transaction",
};
const CONFIRM: Record<string, string> = {
  personalSign: "Sign",
  signTypedData: "Sign",
  solanaSignMessage: "Sign",
  sendTransaction: "Confirm",
  solanaSignTransaction: "Confirm",
  watchAsset: "Add token",
};

/* --------------------------------- connect -------------------------------- */

function ConnectBody({ approval, onSelection }: { approval: Approval; onSelection: (s: string[]) => void }) {
  const { state, account } = useApp();
  const solana = approval.kind === "solanaConnect";
  const [chosen, setChosen] = useState<string[]>(account ? [solana ? account.solana : account.evm] : []);
  useEffect(() => onSelection(chosen), [chosen]);
  if (!state) return null;
  return (
    <>
      <p className="p">
        This site wants to connect to your {solana ? "Solana" : "EVM"} account. Choose which account to share.
      </p>
      <div className="card flush">
        {state.accounts.map((a) => {
          const addr = solana ? a.solana : a.evm;
          const on = chosen.includes(addr);
          return (
            <label key={a.index} className="list-item" style={{ cursor: "pointer" }}>
              <input
                type={solana ? "radio" : "checkbox"}
                name="acct"
                checked={on}
                onChange={() => setChosen(solana ? [addr] : on ? chosen.filter((x) => x !== addr) : [...chosen, addr])}
                style={{ accentColor: "var(--accent-text)" }}
              />
              <Avatar seed={a.evm} label={String(a.index + 1)} />
              <div className="grow col" style={{ gap: 0 }}>
                <strong>{a.name}</strong>
                <span className="small muted mono">{shortAddress(addr, 6)}</span>
              </div>
            </label>
          );
        })}
      </div>
      <div className="card">
        <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
          This site will be able to:
        </div>
        <div className="row small">
          <Icon name="check" size={14} /> See your address and balances
        </div>
        <div className="row small" style={{ marginTop: 4 }}>
          <Icon name="check" size={14} /> Ask you to approve transactions
        </div>
        <div className="row small muted" style={{ marginTop: 4 }}>
          <Icon name="x" size={14} /> It can't move funds without your approval
        </div>
      </div>
    </>
  );
}

/* ---------------------------------- body ---------------------------------- */

function Warnings({ list }: { list?: string[] }) {
  if (!list?.length) return null;
  return (
    <>
      {list.map((w) => (
        <Banner key={w} kind={/UNLIMITED|phishing|fail|drain|Not enough|scam/i.test(w) ? "danger" : "warning"}>
          {w}
        </Banner>
      ))}
    </>
  );
}

function Account({ name, address }: { name: string; address: string }) {
  return (
    <Kv k="Account">
      {name} <span className="muted mono">{shortAddress(address)}</span>
    </Kv>
  );
}

function Body({ approval, onSelection }: { approval: Approval; onSelection: (s: string[]) => void }) {
  const d = approval.details;
  switch (approval.kind) {
    case "connect":
    case "solanaConnect":
      return <ConnectBody approval={approval} onSelection={onSelection} />;

    case "personalSign":
      return (
        <>
          <Warnings list={d.warnings} />
          {d.siwe && (
            <Banner kind="info">
              Sign-in request for <strong>{d.siwe.domain}</strong>. Signing is free and doesn't move funds.
            </Banner>
          )}
          <div className="card">
            <Account name={d.accountName} address={d.address} />
          </div>
          <div className="section-title">Message</div>
          <div className="code-box">{d.message}</div>
          {d.isHex && <Banner>This message isn't readable text. Only sign it if you trust this site.</Banner>}
        </>
      );

    case "signTypedData":
      return <TypedData d={d} />;

    case "sendTransaction":
      return <EvmTx d={d} />;

    case "watchAsset":
      return (
        <>
          <p className="p">This site suggests adding a token to your wallet.</p>
          <div className="card">
            <Kv k="Token">{d.token.symbol}</Kv>
            <Kv k="Decimals">{d.token.decimals}</Kv>
            <Kv k="Contract">
              <span className="mono">{shortAddress(d.token.address, 6)}</span>
            </Kv>
            <Kv k="Network">{getEvmChain(d.chainId)?.name}</Kv>
          </div>
          {d.claimedSymbol && d.claimedSymbol !== d.token.symbol && (
            <Banner>
              The site called this token "{d.claimedSymbol}", but the contract says "{d.token.symbol}". Fake tokens often copy real names.
            </Banner>
          )}
        </>
      );

    case "solanaSignMessage":
      return (
        <>
          <div className="card">
            <Account name={d.accountName} address={d.address} />
          </div>
          <div className="section-title">Message</div>
          <div className="code-box">{d.text ?? d.hex}</div>
          {!d.text && <Banner>This message isn't readable text. Only sign it if you trust this site.</Banner>}
        </>
      );

    case "solanaSignTransaction":
      return <SolanaTx d={d} />;
  }
  return null;
}

function EvmTx({ d }: { d: any }) {
  const p = d.preview;
  const dec = p.decoded;
  const chain = getEvmChain(d.chainId);
  const amountText = (() => {
    if (dec.kind === "nativeTransfer" || (dec.kind === "contractCall" && p.tx.value !== "0")) {
      return `${formatAmount(p.tx.value, 18)} ${p.nativeSymbol}`;
    }
    if (p.token) return dec.unlimited ? `Unlimited ${p.token.symbol}` : `${p.token.amountFormatted ?? "?"} ${p.token.symbol}`;
    return undefined;
  })();
  const action: Record<string, string> = {
    nativeTransfer: "Send",
    erc20Transfer: "Transfer token",
    erc20TransferFrom: "Transfer token (from)",
    approve: "Approve spending",
    increaseAllowance: "Increase allowance",
    setApprovalForAll: dec.approved ? "Approve all NFTs" : "Revoke NFT approval",
    permit2Approve: "Permit2 approval",
    contractCall: "Contract interaction",
    contractDeploy: "Deploy contract",
  };
  return (
    <>
      <Warnings list={p.warnings} />
      {p.willFail && (
        <div className="small muted">
          Reason: <span className="mono">{p.willFail}</span>
        </div>
      )}
      <div className="card">
        <Kv k="Action">
          <strong>{action[dec.kind] ?? "Transaction"}</strong>
        </Kv>
        {amountText && <Kv k="Amount">{amountText}</Kv>}
        {dec.spender && (
          <Kv k={dec.kind === "setApprovalForAll" ? "Operator" : "Spender"}>
            <span className="mono">{shortAddress(dec.spender, 6)}</span>
          </Kv>
        )}
        {dec.recipient && dec.kind !== "nativeTransfer" && (
          <Kv k="Recipient">
            <span className="mono">{shortAddress(dec.recipient, 6)}</span>
          </Kv>
        )}
        <Kv k={dec.kind === "nativeTransfer" ? "To" : "Contract"}>
          <span className="mono">{p.tx.to ? shortAddress(p.tx.to, 6) : "New contract"}</span>
        </Kv>
        <Kv k="Network">{chain?.name}</Kv>
        <Kv k="From">{d.accountName}</Kv>
        <Kv k="Network fee">
          {formatFee(p.maxFeeFormatted)} {p.nativeSymbol} <span className="muted">max</span>
        </Kv>
      </div>
      {dec.selector && dec.kind === "contractCall" && (
        <details className="small">
          <summary className="muted" style={{ cursor: "pointer" }}>
            Raw data ({(p.tx.data.length - 2) / 2} bytes)
          </summary>
          <div className="code-box" style={{ marginTop: 6 }}>
            {p.tx.data}
          </div>
        </details>
      )}
    </>
  );
}

function TypedData({ d }: { d: any }) {
  const info = d.info;
  const fields = useMemo(() => JSON.stringify(d.typedData.message, null, 2), [d.typedData]);
  return (
    <>
      <Warnings list={info.warnings} />
      <div className="card">
        <Account name={d.accountName} address={d.address} />
        <Kv k="Type">{info.primaryType}</Kv>
        {info.domainName && <Kv k="App">{info.domainName}</Kv>}
        {info.verifyingContract && (
          <Kv k="Contract">
            <span className="mono">{shortAddress(info.verifyingContract, 6)}</span>
          </Kv>
        )}
        {info.spender && (
          <Kv k="Spender">
            <span className="mono">{shortAddress(info.spender, 6)}</span>
          </Kv>
        )}
        {info.amount && <Kv k="Amount">{info.unlimited ? "Unlimited" : info.amount}</Kv>}
        <Kv k="Network">{getEvmChain(d.chainId)?.name}</Kv>
      </div>
      <div className="section-title">Message</div>
      <div className="code-box">{fields}</div>
    </>
  );
}

function SolanaTx({ d }: { d: any }) {
  return (
    <>
      <div className="card">
        <Account name={d.accountName} address={d.address} />
        <Kv k="Transactions">{d.summaries.length}</Kv>
        <Kv k="Broadcast">{d.send ? "Rizon sends it" : "Site sends it"}</Kv>
      </div>
      {d.summaries.map((s: any, i: number) => (
        <TxSummary key={i} s={s} index={d.summaries.length > 1 ? i + 1 : undefined} />
      ))}
    </>
  );
}

function TxSummary({ s, index }: { s: any; index?: number }) {
  const change: ReactNode =
    typeof s.solChange === "number" ? (
      <span className={s.solChange < 0 ? "down" : "up"}>
        {s.solChange < 0 ? "−" : "+"}
        {formatUnits(BigInt(Math.abs(s.solChange)), 9)} SOL
      </span>
    ) : (
      <span className="muted">Unknown</span>
    );
  return (
    <>
      <Warnings list={s.warnings} />
      <div className="card">
        {index && <div className="small muted" style={{ marginBottom: 4 }}>Transaction {index}</div>}
        <Kv k="SOL balance change">{change}</Kv>
        <Kv k="Fee payer">{s.weArePayer ? "You" : <span className="mono">{shortAddress(s.feePayer)}</span>}</Kv>
        <Kv k="Programs">
          <span className="col" style={{ gap: 2, alignItems: "flex-end" }}>
            {s.programs.map((p: any) => (
              <span key={p.id} className={p.name ? "" : "mono"}>
                {p.name ?? shortAddress(p.id)}
              </span>
            ))}
          </span>
        </Kv>
      </div>
      {s.simulationError && (
        <div className="small muted">
          Simulation error: <span className="mono">{s.simulationError}</span>
        </div>
      )}
    </>
  );
}
