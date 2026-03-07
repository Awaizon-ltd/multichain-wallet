import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { useChain } from "../contexts/ChainContext";
import {
  ERC20_ABI,
  getRouterConfig,
  isNativeToken,
} from "../config/swapConfig";

export const useTokenApproval = (token, spenderAddress, amountNeeded) => {
  const { address, signer } = useWallet();
  const { activeChain } = useChain();

  const [allowance, setAllowance] = useState("0");
  const [isApproving, setIsApproving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState(null);

  // Check if token is already approved
  const checkAllowance = useCallback(async () => {
    if (!token || !address || !spenderAddress || isNativeToken(token.address)) {
      setAllowance(ethers.MaxUint256.toString()); // Native tokens don't need approval
      return;
    }

    try {
      setIsChecking(true);
      setError(null);

      const provider = new ethers.JsonRpcProvider(activeChain.rpcUrl);
      const tokenContract = new ethers.Contract(
        token.address,
        ERC20_ABI,
        provider,
      );

      const currentAllowance = await tokenContract.allowance(
        address,
        spenderAddress,
      );

      setAllowance(currentAllowance.toString());
    } catch (err) {
      console.error("Error checking allowance:", err);
      setError(err.message);
      setAllowance("0");
    } finally {
      setIsChecking(false);
    }
  }, [token, address, spenderAddress, activeChain]);

  // Check allowance on mount and when dependencies change
  useEffect(() => {
    checkAllowance();
  }, [checkAllowance]);

  // Check if approval is needed
  const needsApproval = useCallback(() => {
    if (!token || !amountNeeded || isNativeToken(token.address)) {
      return false;
    }

    try {
      const amountInWei = ethers.parseUnits(
        amountNeeded.toString(),
        token.decimals,
      );
      const currentAllowance = ethers.getBigInt(allowance);

      return currentAllowance < amountInWei;
    } catch (err) {
      console.error("Error checking if approval needed:", err);
      return true; // Assume approval needed on error
    }
  }, [token, amountNeeded, allowance]);

  // Approve token spending
  const approve = useCallback(
    async (amount = null) => {
      if (!token || !signer || !spenderAddress) {
        throw new Error("Missing required parameters for approval");
      }

      if (isNativeToken(token.address)) {
        return { success: true, message: "Native token doesn't need approval" };
      }

      try {
        setIsApproving(true);
        setError(null);

        const tokenContract = new ethers.Contract(
          token.address,
          ERC20_ABI,
          signer,
        );

        // Use MaxUint256 for unlimited approval (common practice)
        const approvalAmount = amount
          ? ethers.parseUnits(amount.toString(), token.decimals)
          : ethers.MaxUint256;

        console.log(`Approving ${token.symbol} for ${spenderAddress}...`);

        const tx = await tokenContract.approve(spenderAddress, approvalAmount);
        console.log("Approval transaction sent:", tx.hash);

        // Wait for confirmation
        const receipt = await tx.wait();
        console.log("Approval confirmed:", receipt.hash);

        // Update allowance
        await checkAllowance();

        return {
          success: true,
          hash: receipt.hash,
          message: `Successfully approved ${token.symbol}`,
        };
      } catch (err) {
        console.error("Approval error:", err);
        const errorMessage = err.reason || err.message || "Approval failed";
        setError(errorMessage);

        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setIsApproving(false);
      }
    },
    [token, signer, spenderAddress, checkAllowance],
  );

  return {
    allowance,
    isApproving,
    isChecking,
    error,
    needsApproval: needsApproval(),
    approve,
    checkAllowance,
  };
};

export default useTokenApproval;
