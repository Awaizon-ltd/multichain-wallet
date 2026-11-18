import { useEffect, useState } from "react";
import { explorerTxUrl, getEvmChain, SOLANA } from "../../shared/chains";
import type { ActivityItem } from "../../shared/messages";
import { call } from "../api";
import { Icon, TopBar } from "../components/ui";
import { shortAddress, siteHost, timeAgo } from "../format";
import { useApp } from "../state";

export function Activity() {
  const { account } = useApp();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  useEffect(() => {
    call<ActivityItem[]>("listActivity").then(setItems);
    call<ActivityItem[]>("refreshActivity").then(setItems).catch(() => {});
  }, []);
  const mine = items?.filter((i) => !account || i.from === account.evm || i.from === account.solana);

  return (
    <>
      <TopBar title="Activity" />
      <div className="screen">
        {mine?.length === 0 && (
          <div className="empty">
            <Icon name="clock" size={28} />
            No transactions yet from this account in Rizon.
          </div>
        )}
        {mine && mine.length > 0 && (
          <div className="card flush">
            {mine.map((i) => {
              const chain = i.network === "SOLANA" ? SOLANA.name : getEvmChain(i.network)?.name ?? `Chain ${i.network}`;
              return (
                <a key={i.id} className="list-item" href={explorerTxUrl(i.network, i.hash)} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="token-icon">
                    <Icon name={i.kind === "send" ? "send" : "globe"} size={16} />
                  </div>
                  <div className="grow col" style={{ gap: 0, minWidth: 0 }}>
                    <span style={{ fontWeight: 650 }} className="ellipsis">
                      {i.summary}
                    </span>
                    <span className="small muted ellipsis">
                      {chain}
                      {i.origin ? ` · ${siteHost(i.origin)}` : i.to ? ` · to ${shortAddress(i.to)}` : ""}
                    </span>
                  </div>
                  <div className="col right" style={{ gap: 2 }}>
                    <span className={`pill ${i.status === "confirmed" ? "ok" : i.status === "failed" ? "bad" : "warn"}`}>{i.status}</span>
                    <span className="tiny muted">{timeAgo(i.timestamp)}</span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
