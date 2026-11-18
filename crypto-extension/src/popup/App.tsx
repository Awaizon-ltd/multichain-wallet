import { useEffect } from "react";
import { isFullPage, isPopupWindow } from "./api";
import { Approvals } from "./approvals/Approvals";
import { Button, Icon, ToastProvider } from "./components/ui";
import { Activity } from "./screens/Activity";
import { Home } from "./screens/Home";
import { Onboarding } from "./screens/Onboarding";
import { Receive } from "./screens/Receive";
import { Send } from "./screens/Send";
import {
  AccountsSettings,
  BackupSettings,
  ChangePassword,
  NetworksSettings,
  PreferencesSettings,
  ResetWallet,
  RevealPhrase,
  SecuritySettings,
  Settings,
  SitesSettings,
  UsernameSettings,
} from "./screens/Settings";
import { Swap } from "./screens/Swap";
import { Nfts, NftDetail } from "./screens/Nfts";
import { CoinDetail, Market } from "./screens/Market";
import { Unlock } from "./screens/Unlock";
import { RouterProvider, StateProvider, useApp, useRouter } from "./state";

export function App() {
  useEffect(() => {
    document.body.classList.add(isPopupWindow() ? "window" : isFullPage() ? "tab" : "popup");
  }, []);
  return (
    <StateProvider>
      <ToastProvider>
        <div className="app">
          <Root />
        </div>
      </ToastProvider>
    </StateProvider>
  );
}

function Root() {
  const { state } = useApp();
  if (!state) return null;

  if (isPopupWindow()) return <Approvals />;

  if (state.status === "uninitialized") {
    if (isFullPage()) return <Onboarding />;
    return <SetupPrompt />;
  }
  if (state.status === "locked") return <Unlock />;
  if (location.hash.startsWith("#/onboarding")) return <Onboarding key="done" />;

  return (
    <RouterProvider initial={{ name: "home" }}>
      <Main />
    </RouterProvider>
  );
}

/** First run from the toolbar popup: onboarding happens in a full tab so the popup can't close mid-backup. */
function SetupPrompt() {
  return (
    <div className="screen center" style={{ alignItems: "center", textAlign: "center", gap: 14 }}>
      <img className="logo-mark" src="icons/icon128.png" alt="" />
      <h1 className="h2">Welcome to Rizon</h1>
      <p className="p">Set up takes about a minute. It opens in a new tab so you can safely write down your recovery phrase.</p>
      <Button
        className="block"
        onClick={() => {
          chrome.tabs.create({ url: chrome.runtime.getURL("index.html#/onboarding") });
          window.close();
        }}
      >
        Get started
      </Button>
    </div>
  );
}

const TABS = [
  { name: "home", icon: "home", label: "Wallet" },
  { name: "nfts", icon: "nft", label: "NFTs" },
  { name: "market", icon: "chart", label: "Market" },
  { name: "activity", icon: "clock", label: "Activity" },
  { name: "settings", icon: "settings", label: "Settings" },
];

function Main() {
  const { route, go, back } = useRouter();
  const screen = (() => {
    switch (route.name) {
      case "home":
        return <Home />;
      case "activity":
        return <Activity />;
      case "settings":
        return <Settings />;
      case "send":
        return <Send />;
      case "receive":
        return <Receive />;
      case "swap":
        return <Swap />;
      case "nfts":
        return <Nfts />;
      case "nft":
        return <NftDetail />;
      case "market":
        return <Market />;
      case "coin":
        return <CoinDetail />;
      case "settings.username":
        return <UsernameSettings />;
      case "settings.backup":
        return <BackupSettings />;
      case "approvals":
        return <Approvals onEmpty={back} />;
      case "settings.accounts":
        return <AccountsSettings />;
      case "settings.networks":
        return <NetworksSettings />;
      case "settings.sites":
        return <SitesSettings />;
      case "settings.security":
        return <SecuritySettings />;
      case "settings.preferences":
        return <PreferencesSettings />;
      case "settings.reveal":
        return <RevealPhrase />;
      case "settings.password":
        return <ChangePassword />;
      case "settings.reset":
        return <ResetWallet />;
    }
    return <Home />;
  })();
  const isTab = TABS.some((t) => t.name === route.name);
  return (
    <>
      {screen}
      {isTab && (
        <nav className="nav">
          {TABS.map((t) => (
            <button key={t.name} className={route.name === t.name ? "active" : ""} onClick={() => go({ name: t.name, params: { replace: true } })}>
              <Icon name={t.icon} size={20} />
              {t.label}
            </button>
          ))}
        </nav>
      )}
    </>
  );
}
