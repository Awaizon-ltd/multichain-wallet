import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { EVM_CHAINS, SOLANA } from "../../shared/chains";
import { Banner, Button, Icon, TopBar, useCopy } from "../components/ui";
import { useApp, useRouter } from "../state";

export function Receive() {
  const { account } = useApp();
  const { back } = useRouter();
  const copy = useCopy();
  const [tab, setTab] = useState<"evm" | "solana">("evm");
  const [qr, setQr] = useState("");
  const address = tab === "evm" ? account?.evm : account?.solana;

  useEffect(() => {
    if (!address) return;
    QRCode.toDataURL(address, { margin: 0, width: 400, errorCorrectionLevel: "M" }).then(setQr);
  }, [address]);

  if (!account || !address) return null;
  const evmNames = EVM_CHAINS.filter((c) => !c.testnet).map((c) => c.name);

  return (
    <>
      <TopBar title="Receive" onBack={back} />
      <div className="screen">
        <div className="tabs" role="tablist">
          <button className={tab === "evm" ? "active" : ""} onClick={() => setTab("evm")} role="tab" aria-selected={tab === "evm"}>
            EVM networks
          </button>
          <button className={tab === "solana" ? "active" : ""} onClick={() => setTab("solana")} role="tab" aria-selected={tab === "solana"}>
            Solana
          </button>
        </div>
        <div className="qr">{qr && <img src={qr} alt={`QR code for ${address}`} />}</div>
        <div className="card">
          <div className="small muted" style={{ marginBottom: 4 }}>
            {account.name} · {tab === "evm" ? "EVM address" : "Solana address"}
          </div>
          <div className="mono">{address}</div>
        </div>
        <Button className="block" onClick={() => copy(address, "Address copied")}>
          <Icon name="copy" size={16} /> Copy address
        </Button>
        <Banner kind="info">
          {tab === "evm" ? (
            <>
              This one address works on <strong>{evmNames.join(", ")}</strong>. Only send assets on these networks.
            </>
          ) : (
            <>Only send SOL and {SOLANA.name} (SPL) tokens to this address.</>
          )}
        </Banner>
      </div>
    </>
  );
}
