import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { ERC20_ABI, isNativeToken } from "../config/swapConfig";

export const useSeamlessSwap = () => {
  const { address } = useWallet();
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [approvalTxHash, setApprovalTxHash] = useState(null);

  // ✅ Check if approval is needed
  const checkApproval = useCallback(
    async (fromToken, amountIn, routerAddress, signer) => {
      // Native tokens don't need approval
      if (isNativeToken(fromToken.address)) {
        setNeedsApproval(false);
        return false;
      }

      try {
        setCheckingApproval(true);

        const tokenContract = new ethers.Contract(
          fromToken.address,
          ERC20_ABI,
          signer,
        );

        const amountInWei = ethers.parseUnits(
          amountIn.toString(),
          fromToken.decimals,
        );

        const currentAllowance = await tokenContract.allowance(
          address,
          routerAddress,
        );

        const needsApprove = currentAllowance < amountInWei;
        setNeedsApproval(needsApprove);

        return needsApprove;
      } catch (err) {
        console.error("[checkApproval] Error:", err);
        return true; // Assume approval needed on error
      } finally {
        setCheckingApproval(false);
      }
    },
    [address],
  );

  // ✅ Approve token
  const approveToken = useCallback(async (fromToken, routerAddress, signer) => {
    try {
      const tokenContract = new ethers.Contract(
        fromToken.address,
        ERC20_ABI,
        signer,
      );

      console.log(`[approveToken] Approving ${fromToken.symbol} for router...`);

      // Use MaxUint256 for unlimited approval (gas efficient, one-time)
      const tx = await tokenContract.approve(routerAddress, ethers.MaxUint256);

      console.log("[approveToken] Approval tx sent:", tx.hash);
      setApprovalTxHash(tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log("[approveToken] ✅ Approval confirmed");

      setNeedsApproval(false);
      return receipt;
    } catch (err) {
      console.error("[approveToken] ❌ Error:", err);
      throw err;
    }
  }, []);

  return {
    checkApproval,
    approveToken,
    checkingApproval,
    needsApproval,
    approvalTxHash,
  };
};

export default useSeamlessSwap;
