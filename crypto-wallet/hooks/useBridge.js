// hooks/useBridge.js
import { useState, useCallback } from "react";
import { Contract, parseEther, formatEther } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { useChain } from "../contexts/ChainContext";

/* =========================================================
   BRIDGE CONTRACTS
========================================================= */

const BRIDGE_CONTRACTS = {
  ethereum: {
    L1StandardBridge: "0x95fC37A27a2f68e3A647CDc081F0A89bb47c3012",
    L1CrossDomainMessenger: "0x676A795fe6E43C17c668de16730c3F690FEB7120",
  },
  mantle: {
    L2StandardBridge: "0x4200000000000000000000000000000000000010",
    L2ToL1MessagePasser: "0x4200000000000000000000000000000000000016",
  },
};

const L1_BRIDGE_ABI = [
  "function depositETH(uint32 _minGasLimit, bytes calldata _extraData) external payable",
  "function depositETHTo(address _to, uint32 _minGasLimit, bytes calldata _extraData) external payable",
  "function depositERC20(address _l1Token, address _l2Token, uint256 _amount, uint32 _minGasLimit, bytes calldata _extraData) external",
  "function depositERC20To(address _l1Token, address _l2Token, address _to, uint256 _amount, uint32 _minGasLimit, bytes calldata _extraData) external",
];

const L2_BRIDGE_ABI = [
  "function withdraw(address _l2Token, uint256 _amount, uint32 _minGasLimit, bytes calldata _extraData) external payable",
  "function withdrawTo(address _l2Token, address _to, uint256 _amount, uint32 _minGasLimit, bytes calldata _extraData) external payable",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
];

const DEFAULT_GAS_LIMIT = 200000;

/* =========================================================
   ERROR PARSER
========================================================= */

const parseBridgeError = (error) => {
  if (error.code === 4001 || error.code === "ACTION_REJECTED") {
    return {
      title: "Transaction Cancelled",
      message: "You cancelled the bridge transaction.",
      type: "cancelled",
    };
  }

  if (
    error.code === "INSUFFICIENT_FUNDS" ||
    error.message?.includes("insufficient funds")
  ) {
    return {
      title: "Insufficient Funds",
      message: "You don't have enough balance to complete this bridge.",
      type: "insufficient_funds",
    };
  }

  if (
    error.code === "UNPREDICTABLE_GAS_LIMIT" ||
    error.message?.includes("cannot estimate gas")
  ) {
    return {
      title: "Bridge Will Fail",
      message:
        "This bridge transaction is likely to fail. Please check your balance and try again.",
      type: "gas_error",
    };
  }

  if (error.message?.includes("execution reverted")) {
    return {
      title: "Bridge Rejected",
      message:
        "The bridge contract rejected this transaction. Please verify your inputs.",
      type: "contract_revert",
    };
  }

  return {
    title: "Bridge Error",
    message: error.message || "An unexpected error occurred during bridging.",
    type: "unknown",
    originalError: error.message,
  };
};

/* =========================================================
   CUSTOM HOOK
========================================================= */

export function useBridge() {
  const { provider, address } = useWallet();
  const { activeChain } = useChain();

  const [gasInfo, setGasInfo] = useState(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [error, setError] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(null);

  /**
   * ✅ Estimate gas for bridge transaction
   */
  const estimateGas = useCallback(
    async ({
      direction,
      assetType,
      amount,
      l1TokenAddress,
      l2TokenAddress,
      signer,
    }) => {
      if (!provider) {
        const error = {
          title: "Provider Not Available",
          message: "Please wait for the provider to initialize.",
          type: "provider_not_available",
        };
        setError(error);
        throw error;
      }

      setIsEstimating(true);
      setError(null);

      try {
        const amountWei = parseEther(amount);
        let gasLimit;
        let contract;

        const estimator = signer || provider;

        // Determine which bridge to use
        if (direction === "L1_TO_L2") {
          contract = new Contract(
            BRIDGE_CONTRACTS.ethereum.L1StandardBridge,
            L1_BRIDGE_ABI,
            estimator,
          );

          if (assetType === "native") {
            // Estimate ETH deposit
            gasLimit = await contract.depositETH.estimateGas(
              DEFAULT_GAS_LIMIT,
              "0x",
              { value: amountWei, from: address },
            );
          } else {
            // Estimate ERC20 deposit
            gasLimit = await contract.depositERC20.estimateGas(
              l1TokenAddress,
              l2TokenAddress,
              amountWei,
              DEFAULT_GAS_LIMIT,
              "0x",
              { from: address },
            );
          }
        } else {
          // L2 to L1
          contract = new Contract(
            BRIDGE_CONTRACTS.mantle.L2StandardBridge,
            L2_BRIDGE_ABI,
            estimator,
          );

          if (assetType === "native") {
            // Estimate ETH withdrawal
            gasLimit = await contract.withdraw.estimateGas(
              "0x0000000000000000000000000000000000000000",
              amountWei,
              DEFAULT_GAS_LIMIT,
              "0x",
              { value: amountWei, from: address },
            );
          } else {
            // Estimate ERC20 withdrawal
            gasLimit = await contract.withdraw.estimateGas(
              l2TokenAddress,
              amountWei,
              DEFAULT_GAS_LIMIT,
              "0x",
              { from: address },
            );
          }
        }

        // Get fee data
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice;

        // Calculate estimated cost
        const estimatedCostWei = gasLimit * gasPrice;
        const estimatedCostEth = parseFloat(formatEther(estimatedCostWei));

        const info = {
          gasLimit: gasLimit.toString(),
          gasPrice: formatEther(gasPrice * BigInt(1e9)), // Convert to Gwei
          estimatedCostEth,
          maxFeePerGas: feeData.maxFeePerGas
            ? formatEther(feeData.maxFeePerGas * BigInt(1e9))
            : null,
        };

        setGasInfo(info);
        setError(null);
        console.log("[useBridge] ✅ Gas estimation successful:", info);
        return info;
      } catch (err) {
        console.error("[useBridge] Gas estimation failed:", err);
        const parsedError = parseBridgeError(err);
        setError(parsedError);
        throw parsedError;
      } finally {
        setIsEstimating(false);
      }
    },
    [provider, address],
  );

  /**
   * ✅ Get token balance
   */
  const getTokenBalance = useCallback(
    async (tokenAddress) => {
      if (!provider || !address || !tokenAddress) return null;

      try {
        const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
        const balance = await tokenContract.balanceOf(address);
        const formatted = formatEther(balance);

        setTokenBalance({ wei: balance.toString(), formatted });
        return { wei: balance.toString(), formatted };
      } catch (err) {
        console.error("[useBridge] Error fetching token balance:", err);
        return null;
      }
    },
    [provider, address],
  );

  /**
   * ✅ Execute bridge transaction
   */
  const executeBridge = useCallback(
    async ({
      direction,
      assetType,
      amount,
      l1TokenAddress,
      l2TokenAddress,
      gasLimit,
      signer,
      onProgress,
    }) => {
      if (!signer) {
        const error = {
          title: "Signer Not Available",
          message: "Please unlock your wallet to continue.",
          type: "signer_not_available",
        };
        setError(error);
        throw error;
      }

      setError(null);

      try {
        const amountWei = parseEther(amount);
        let tx;

        if (direction === "L1_TO_L2") {
          const bridge = new Contract(
            BRIDGE_CONTRACTS.ethereum.L1StandardBridge,
            L1_BRIDGE_ABI,
            signer,
          );

          if (assetType === "native") {
            onProgress?.("Depositing ETH to Mantle...");
            const overrides = { value: amountWei };
            if (gasLimit) overrides.gasLimit = BigInt(gasLimit);

            tx = await bridge.depositETH(DEFAULT_GAS_LIMIT, "0x", overrides);
          } else {
            // Approve token first
            onProgress?.("Approving token...");
            const tokenContract = new Contract(
              l1TokenAddress,
              ERC20_ABI,
              signer,
            );

            const allowance = await tokenContract.allowance(
              address,
              BRIDGE_CONTRACTS.ethereum.L1StandardBridge,
            );

            if (allowance < amountWei) {
              const approveTx = await tokenContract.approve(
                BRIDGE_CONTRACTS.ethereum.L1StandardBridge,
                amountWei,
              );
              await approveTx.wait();
            }

            // Deposit token
            onProgress?.("Depositing token to Mantle...");
            const overrides = {};
            if (gasLimit) overrides.gasLimit = BigInt(gasLimit);

            tx = await bridge.depositERC20(
              l1TokenAddress,
              l2TokenAddress,
              amountWei,
              DEFAULT_GAS_LIMIT,
              "0x",
              overrides,
            );
          }
        } else {
          // L2 to L1
          const bridge = new Contract(
            BRIDGE_CONTRACTS.mantle.L2StandardBridge,
            L2_BRIDGE_ABI,
            signer,
          );

          if (assetType === "native") {
            onProgress?.("Withdrawing ETH to Ethereum...");
            const overrides = { value: amountWei };
            if (gasLimit) overrides.gasLimit = BigInt(gasLimit);

            tx = await bridge.withdraw(
              "0x0000000000000000000000000000000000000000",
              amountWei,
              DEFAULT_GAS_LIMIT,
              "0x",
              overrides,
            );
          } else {
            onProgress?.("Withdrawing token to Ethereum...");
            const overrides = {};
            if (gasLimit) overrides.gasLimit = BigInt(gasLimit);

            tx = await bridge.withdraw(
              l2TokenAddress,
              amountWei,
              DEFAULT_GAS_LIMIT,
              "0x",
              overrides,
            );
          }
        }

        console.log("[useBridge] ✅ Transaction submitted:", tx.hash);

        onProgress?.("Waiting for confirmation...");
        const receipt = await tx.wait();

        console.log("[useBridge] ✅ Transaction confirmed:", receipt.hash);

        setError(null);
        return receipt;
      } catch (err) {
        console.error("[useBridge] ❌ Bridge execution failed:", err);
        const parsedError = parseBridgeError(err);
        setError(parsedError);
        throw parsedError;
      }
    },
    [address],
  );

  const clearError = () => setError(null);

  return {
    estimateGas,
    executeBridge,
    getTokenBalance,
    gasInfo,
    isEstimating,
    error,
    tokenBalance,
    clearError,
  };
}
