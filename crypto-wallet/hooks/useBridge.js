// hooks/useBridge.js
// ─────────────────────────────────────────────────────────────────────────────
// Cross-chain bridge, powered by LI.FI via the backend (/api/bridge/*).
// Works between ANY two chains LI.FI supports — not just one hardcoded pair —
// so adding/removing a chain in constants/Chain.js is all that's needed on
// the frontend for it to show up here too.
//
// Flow:
//   1. getQuote({fromChainId, toChainId, fromToken, toToken, fromAmount, fromAddress})
//      → backend calls LI.FI, returns a normalized quote with an unsigned
//        transactionRequest (and an approval address if the token needs one).
//   2. executeBridge({ quote, signer, onProgress })
//      → approves the token if needed, then signs + broadcasts the bridge tx.
//      The private key never leaves the device — only the signer is passed in,
//      created by BridgeTransactionModal via createSignerForTransaction(pin).
//   3. getStatus(txHash, quote.statusParams) → poll delivery on the destination chain.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { Contract, MaxUint256 } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { API_CONFIG } from "../config/api";
import { apiGet } from "../services/apiClient";
import { humanizeError } from "../utils/errors/humanizeError";
import {
  getNativeBalance,
  getTokenBalance as getTokenBalanceUtil,
} from "../utils/blockchain/Balances";
import { getChainById } from "../constants/Chain";

const ERC20_ALLOWANCE_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

/* =========================================================
   HOOK
========================================================= */

export function useBridge() {
  const { address } = useWallet();

  const [quote, setQuote] = useState(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [error, setError] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(null);

  /* ─── getQuote — one call covers both same-chain swap and cross-chain bridge ─ */
  const getQuote = useCallback(
    async ({
      fromChainId,
      toChainId,
      fromToken,
      toToken,
      fromAmount,
      fromAddress,
      toAddress,
      slippage = 0.005,
    }) => {
      setIsQuoting(true);
      setError(null);

      try {
        // Never cached — a bridge quote is single-use and time-sensitive.
        const data = await apiGet(API_CONFIG.ENDPOINTS.BRIDGE_QUOTE, {
          ttl: 0,
          params: {
            fromChain: fromChainId,
            toChain: toChainId,
            fromToken,
            toToken,
            fromAmount,
            fromAddress: fromAddress || address,
            ...(toAddress ? { toAddress } : {}),
            slippage,
          },
        });

        setQuote(data.data);
        return data.data;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setIsQuoting(false);
      }
    },
    [address],
  );

  /* ─── executeBridge — approve (if needed) then sign + broadcast ────────────
     Requires a signer created by BridgeTransactionModal via
     createSignerForTransaction(pin). The private key never leaves the device. */
  const executeBridge = useCallback(
    async ({ quote: q, signer, onProgress }) => {
      if (!signer) {
        const err = {
          title: "Wallet Locked",
          message: "Please unlock your wallet to continue.",
          type: "signer_not_available",
        };
        setError(err);
        throw err;
      }
      if (!q?.transaction?.to) {
        const err = {
          title: "No Route",
          message: "This quote is missing a transaction to sign.",
          type: "invalid_quote",
        };
        setError(err);
        throw err;
      }

      setError(null);

      try {
        // Step 1: approve the sell token if LI.FI's route needs an allowance
        // (native-token bridges skip this entirely).
        if (q.needsApproval && q.allowanceTarget && q.sellToken) {
          onProgress?.("Approving token…");
          const tokenContract = new Contract(
            q.sellToken,
            ERC20_ALLOWANCE_ABI,
            signer,
          );
          const owner = await signer.getAddress();
          const allowance = await tokenContract.allowance(
            owner,
            q.allowanceTarget,
          );
          if (BigInt(allowance) < BigInt(q.sellAmount || 0)) {
            const approveTx = await tokenContract.approve(
              q.allowanceTarget,
              MaxUint256,
            );
            await approveTx.wait();
          }
        }

        // Step 2: sign + broadcast the bridge transaction itself
        onProgress?.("Confirming bridge transaction…");
        const tx = await signer.sendTransaction({
          to: q.transaction.to,
          data: q.transaction.data,
          value: q.transaction.value || "0x0",
          ...(q.transaction.gasLimit ? { gasLimit: q.transaction.gasLimit } : {}),
        });

        onProgress?.("Waiting for confirmation…");
        const receipt = await tx.wait();

        console.log("[useBridge] ✅ Confirmed:", receipt.hash || receipt.transactionHash);
        return receipt;
      } catch (err) {
        const parsed = humanizeError(err, { fallbackTitle: "Bridge Failed" });
        setError(parsed);
        throw parsed;
      }
    },
    [],
  );

  /* ─── getAssetBalance — same balances.js helpers used elsewhere ──────────── */
  const getAssetBalance = useCallback(
    async ({ chainId, tokenAddress, isNative }) => {
      if (!address) return null;

      try {
        const chain = getChainById(parseInt(chainId));
        if (!chain) return null;

        const balance = isNative
          ? await getNativeBalance(address, chain)
          : await getTokenBalanceUtil(tokenAddress, address, chain);

        setTokenBalance(balance);
        return balance;
      } catch (err) {
        console.error("[useBridge] getAssetBalance failed:", err);
        return null;
      }
    },
    [address],
  );

  /* ─── getStatus — poll delivery on the destination chain ──────────────────── */
  const getStatus = useCallback(async (txHash, statusParams = {}) => {
    try {
      // Never cached — this is a live poll; a cached "pending" would never
      // update to "delivered" for the polling window.
      return await apiGet(API_CONFIG.ENDPOINTS.BRIDGE_STATUS_QUERY, {
        ttl: 0,
        params: {
          txHash,
          ...(statusParams.bridge ? { bridge: statusParams.bridge } : {}),
          ...(statusParams.fromChain ? { fromChain: statusParams.fromChain } : {}),
          ...(statusParams.toChain ? { toChain: statusParams.toChain } : {}),
        },
      });
    } catch (err) {
      setError(err);
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearQuote = useCallback(() => setQuote(null), []);

  return {
    getQuote,
    quote,
    isQuoting,
    executeBridge,
    getAssetBalance,
    tokenBalance,
    getStatus,
    error,
    clearError,
    clearQuote,
  };
}
