import React, { createContext, useContext, useState, useEffect } from "react";
import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit";
import { useWallet } from "./WalletContext";

const WalletConnectContext = createContext(null);

export const useWalletConnect = () => {
  const context = useContext(WalletConnectContext);
  if (!context) {
    throw new Error(
      "useWalletConnect must be used within WalletConnectProvider",
    );
  }
  return context;
};

export const WalletConnectProvider = ({
  children,
  projectId,
  metadata = {
    name: "My Expo Wallet",
    description: "Expo Wallet with WalletConnect",
    url: "https://myexpowallet.com",
    icons: ["https://myexpowallet.com/icon.png"],
    redirect: {
      native: "myexpowallet://",
      universal: "https://myexpowallet.com",
      linkMode: true,
    },
  },
}) => {
  const [walletKit, setWalletKit] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState(null);

  // Get wallet data from existing WalletContext
  const { wallet, isAuthenticated } = useWallet();

  useEffect(() => {
    initializeWalletConnect();
  }, [projectId]);

  const initializeWalletConnect = async () => {
    if (isInitializing || isInitialized) return;

    setIsInitializing(true);
    setError(null);

    try {
      console.log("[WalletConnect] Initializing...");

      // Initialize Core
      const core = new Core({
        projectId: projectId,
      });

      // Initialize WalletKit
      const kit = await WalletKit.init({
        core,
        metadata,
      });

      setWalletKit(kit);

      // Load existing sessions
      const existingSessions = kit.getActiveSessions();
      setSessions(Object.values(existingSessions));

      // Set up event listeners
      setupEventListeners(kit);

      setIsInitialized(true);
      console.log("[WalletConnect] ✅ Initialized successfully");
    } catch (err) {
      console.error("[WalletConnect] ❌ Failed to initialize:", err);
      setError(err);
    } finally {
      setIsInitializing(false);
    }
  };

  const setupEventListeners = (kit) => {
    // Session proposal - when dApp wants to connect
    kit.on("session_proposal", async (proposal) => {
      console.log(
        "[WalletConnect] 📨 Session proposal received:",
        proposal.params.proposer.metadata.name,
      );
      setProposals((prev) => [...prev, proposal]);
    });

    // Session request - when dApp wants to sign something
    kit.on("session_request", async (requestEvent) => {
      console.log(
        "[WalletConnect] 📝 Session request received:",
        requestEvent.params.request.method,
      );
      setRequests((prev) => [...prev, requestEvent]);
    });

    // Session delete - when session is disconnected
    kit.on("session_delete", ({ topic }) => {
      console.log("[WalletConnect] 🔌 Session deleted:", topic);
      setSessions((prev) => prev.filter((s) => s.topic !== topic));
      setProposals((prev) =>
        prev.filter((p) => p.params.pairingTopic !== topic),
      );
    });

    // Auth request
    kit.on("auth_request", async (authRequest) => {
      console.log("[WalletConnect] 🔐 Auth request received:", authRequest);
    });

    // Session update
    kit.on("session_update", ({ topic, params }) => {
      console.log("[WalletConnect] 🔄 Session updated:", topic);
      setSessions((prev) => {
        const index = prev.findIndex((s) => s.topic === topic);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...params };
          return updated;
        }
        return prev;
      });
    });
  };

  // Get active sessions (filter expired)
  const activeSessions = sessions.filter((session) => {
    const expiryTimestamp = session.expiry * 1000;
    return expiryTimestamp > Date.now();
  });

  const value = {
    walletKit,
    sessions,
    proposals,
    requests,
    isInitialized,
    isInitializing,
    error,
    activeSessions,
    setProposals,
    setRequests,
    setSessions,
  };

  return (
    <WalletConnectContext.Provider value={value}>
      {children}
    </WalletConnectContext.Provider>
  );
};
