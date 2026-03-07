import { useCallback } from "react";
import { useWalletConnect } from "../contexts/WalletConnectContext";
import { useWallet } from "../contexts/WalletContext";
import { getSdkError } from "@walletconnect/utils";
import { ethers } from "ethers";

/**
 * Hook for managing WalletConnect sessions
 * Integrates with your existing WalletContext
 */
export const useWalletConnectSession = () => {
  const {
    walletKit,
    sessions,
    proposals,
    activeSessions,
    setProposals,
    setSessions,
  } = useWalletConnect();
  const { wallet, accounts } = useWallet();

  /**
   * Pair with a dApp using WalletConnect URI
   */
  const pair = useCallback(
    async (uri) => {
      if (!walletKit) {
        throw new Error("WalletKit not initialized");
      }

      try {
        console.log("[WC Session] 🔗 Pairing with URI...");
        await walletKit.core.pairing.pair({ uri });
        console.log("[WC Session] ✅ Pairing successful");
      } catch (error) {
        console.error("[WC Session] ❌ Pairing failed:", error);
        throw error;
      }
    },
    [walletKit],
  );

  /**
   * Approve a session proposal
   * Uses all accounts from your WalletContext
   */
  const approveSession = useCallback(
    async (proposal, chainIds = [1, 137, 56]) => {
      if (!walletKit) {
        throw new Error("WalletKit not initialized");
      }

      if (!wallet?.address) {
        throw new Error("No wallet connected");
      }

      try {
        console.log("[WC Session] ✅ Approving session...");

        const { id, params } = proposal;
        const { requiredNamespaces, optionalNamespaces } = params;

        // Get all account addresses from your WalletContext
        const allAddresses =
          accounts && accounts.length > 0
            ? accounts.map((acc) => acc.address)
            : [wallet.address];

        // Format accounts in CAIP-10 format for all chains
        const formattedAccounts = [];
        chainIds.forEach((chainId) => {
          allAddresses.forEach((address) => {
            formattedAccounts.push(`eip155:${chainId}:${address}`);
          });
        });

        // Build namespaces
        const namespaces = {};

        // Handle required namespaces
        Object.keys(requiredNamespaces).forEach((key) => {
          const chains = requiredNamespaces[key].chains || [];
          const methods = requiredNamespaces[key].methods || [];
          const events = requiredNamespaces[key].events || [];

          namespaces[key] = {
            accounts: formattedAccounts.filter((account) =>
              chains.some((chain) => account.startsWith(`${chain}:`)),
            ),
            methods,
            events,
          };
        });

        // Handle optional namespaces
        if (optionalNamespaces) {
          Object.keys(optionalNamespaces).forEach((key) => {
            if (!namespaces[key]) {
              const chains = optionalNamespaces[key].chains || [];
              const methods = optionalNamespaces[key].methods || [];
              const events = optionalNamespaces[key].events || [];

              namespaces[key] = {
                accounts: formattedAccounts.filter((account) =>
                  chains.some((chain) => account.startsWith(`${chain}:`)),
                ),
                methods,
                events,
              };
            }
          });
        }

        console.log(
          "[WC Session] 📤 Sending approval with namespaces:",
          namespaces,
        );

        const session = await walletKit.approveSession({
          id,
          namespaces,
        });

        console.log("[WC Session] ✅ Session approved");

        // Remove from proposals
        setProposals((prev) => prev.filter((p) => p.id !== id));

        // Add to sessions
        setSessions((prev) => [...prev, session]);

        return session;
      } catch (error) {
        console.error("[WC Session] ❌ Failed to approve session:", error);
        throw error;
      }
    },
    [walletKit, wallet, accounts, setProposals, setSessions],
  );

  /**
   * Reject a session proposal
   */
  const rejectSession = useCallback(
    async (proposalId, reason) => {
      if (!walletKit) {
        throw new Error("WalletKit not initialized");
      }

      try {
        console.log("[WC Session] ❌ Rejecting session...");

        await walletKit.rejectSession({
          id: proposalId,
          reason: getSdkError(reason || "USER_REJECTED"),
        });

        console.log("[WC Session] ✅ Session rejected");

        // Remove from proposals
        setProposals((prev) => prev.filter((p) => p.id !== proposalId));
      } catch (error) {
        console.error("[WC Session] ❌ Failed to reject session:", error);
        throw error;
      }
    },
    [walletKit, setProposals],
  );

  /**
   * Disconnect a session
   */
  const disconnectSession = useCallback(
    async (topic) => {
      if (!walletKit) {
        throw new Error("WalletKit not initialized");
      }

      try {
        console.log("[WC Session] 🔌 Disconnecting session...");

        await walletKit.disconnectSession({
          topic,
          reason: getSdkError("USER_DISCONNECTED"),
        });

        console.log("[WC Session] ✅ Session disconnected");

        // Remove from sessions
        setSessions((prev) => prev.filter((s) => s.topic !== topic));
      } catch (error) {
        console.error("[WC Session] ❌ Failed to disconnect session:", error);
        throw error;
      }
    },
    [walletKit, setSessions],
  );

  /**
   * Get session by topic
   */
  const getSession = useCallback(
    (topic) => {
      return sessions.find((s) => s.topic === topic);
    },
    [sessions],
  );

  return {
    pair,
    approveSession,
    rejectSession,
    disconnectSession,
    getSession,
    sessions,
    proposals,
    activeSessions,
  };
};

/**
 * Hook for handling WalletConnect requests
 * Integrates with your existing WalletContext's createSignerForTransaction
 */
export const useWalletConnectRequests = () => {
  const { walletKit, requests, setRequests } = useWalletConnect();
  const { wallet, createSignerForTransaction, isAuthenticated } = useWallet();

  /**
   * Handle a session request using your WalletContext's signer
   */
  const handleRequest = useCallback(
    async (requestEvent, passcode) => {
      if (!walletKit) {
        throw new Error("WalletKit not initialized");
      }

      if (!wallet) {
        throw new Error("Wallet not connected");
      }

      if (!isAuthenticated && !passcode) {
        throw new Error("Authentication required - please provide passcode");
      }

      const { topic, params, id } = requestEvent;
      const { request } = params;
      const { method, params: requestParams } = request;

      try {
        console.log(`[WC Request] 📝 Handling ${method}...`);

        // Create signer using your existing WalletContext method
        const signer = await createSignerForTransaction(passcode);

        let result;

        switch (method) {
          case "eth_sendTransaction":
            result = await handleSendTransaction(requestParams[0], signer);
            break;

          case "personal_sign":
            result = await handlePersonalSign(requestParams, signer);
            break;

          case "eth_sign":
            result = await handleEthSign(requestParams, signer);
            break;

          case "eth_signTypedData":
          case "eth_signTypedData_v4":
            result = await handleSignTypedData(requestParams, signer);
            break;

          case "eth_signTransaction":
            result = await handleSignTransaction(requestParams[0], signer);
            break;

          default:
            throw new Error(`Unsupported method: ${method}`);
        }

        console.log(`[WC Request] ✅ ${method} completed`);

        // Respond with success
        await walletKit.respondSessionRequest({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            result,
          },
        });

        // Remove from pending requests
        setRequests((prev) => prev.filter((r) => r.id !== id));

        return result;
      } catch (error) {
        console.error("[WC Request] ❌ Request handling failed:", error);

        // Respond with error
        await walletKit.respondSessionRequest({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            error: {
              code: 5000,
              message: error.message || "Unknown error",
            },
          },
        });

        // Remove from pending requests
        setRequests((prev) => prev.filter((r) => r.id !== id));

        throw error;
      }
    },
    [
      walletKit,
      wallet,
      createSignerForTransaction,
      isAuthenticated,
      setRequests,
    ],
  );

  /**
   * Reject a session request
   */
  const rejectRequest = useCallback(
    async (requestEvent, reason) => {
      if (!walletKit) {
        throw new Error("WalletKit not initialized");
      }

      const { topic, id } = requestEvent;

      try {
        console.log("[WC Request] ❌ Rejecting request...");

        await walletKit.respondSessionRequest({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            error: {
              code: 5000,
              message: reason || "User rejected request",
            },
          },
        });

        console.log("[WC Request] ✅ Request rejected");

        // Remove from pending requests
        setRequests((prev) => prev.filter((r) => r.id !== id));
      } catch (error) {
        console.error("[WC Request] ❌ Failed to reject request:", error);
        throw error;
      }
    },
    [walletKit, setRequests],
  );

  return {
    handleRequest,
    rejectRequest,
    requests,
  };
};

// Helper functions for handling different request types

async function handleSendTransaction(transaction, signer) {
  console.log("[WC Helper] 💸 Sending transaction...");

  const tx = await signer.sendTransaction({
    to: transaction.to,
    value: transaction.value
      ? ethers.BigNumber.from(transaction.value)
      : undefined,
    data: transaction.data,
    gasLimit: transaction.gas
      ? ethers.BigNumber.from(transaction.gas)
      : undefined,
    gasPrice: transaction.gasPrice
      ? ethers.BigNumber.from(transaction.gasPrice)
      : undefined,
  });

  console.log("[WC Helper] ✅ Transaction sent:", tx.hash);
  return tx.hash;
}

async function handlePersonalSign(params, signer) {
  console.log("[WC Helper] ✍️ Personal sign...");

  const message = params[0];
  const signature = await signer.signMessage(
    ethers.utils.isHexString(message)
      ? ethers.utils.arrayify(message)
      : message,
  );

  console.log("[WC Helper] ✅ Message signed");
  return signature;
}

async function handleEthSign(params, signer) {
  console.log("[WC Helper] ✍️ Eth sign...");

  const [address, message] = params;
  const signature = await signer.signMessage(ethers.utils.arrayify(message));

  console.log("[WC Helper] ✅ Message signed");
  return signature;
}

async function handleSignTypedData(params, signer) {
  console.log("[WC Helper] ✍️ Sign typed data...");

  const [address, typedData] = params;
  const data =
    typeof typedData === "string" ? JSON.parse(typedData) : typedData;

  const { domain, types, message } = data;

  // Remove EIP712Domain from types
  const filteredTypes = { ...types };
  delete filteredTypes.EIP712Domain;

  const signature = await signer._signTypedData(domain, filteredTypes, message);

  console.log("[WC Helper] ✅ Typed data signed");
  return signature;
}

async function handleSignTransaction(transaction, signer) {
  console.log("[WC Helper] ✍️ Sign transaction...");

  const signedTx = await signer.signTransaction({
    to: transaction.to,
    value: transaction.value
      ? ethers.BigNumber.from(transaction.value)
      : undefined,
    data: transaction.data,
    gasLimit: transaction.gas
      ? ethers.BigNumber.from(transaction.gas)
      : undefined,
    gasPrice: transaction.gasPrice
      ? ethers.BigNumber.from(transaction.gasPrice)
      : undefined,
    nonce: transaction.nonce ? parseInt(transaction.nonce) : undefined,
  });

  console.log("[WC Helper] ✅ Transaction signed");
  return signedTx;
}
