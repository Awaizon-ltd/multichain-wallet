// hooks/useMantleBridge.js
import { useState, useCallback } from "react";
import { ethers, Contract } from "ethers";
import { Alert } from "react-native";

const BRIDGE_CONTRACTS = {
  ethereum: {
    L1StandardBridge: "0x95fC37A27a2f68e3A647CDc081F0A89bb47c3012",
  },
  mantle: {
    L2StandardBridge: "0x4200000000000000000000000000000000000010",
  },
};

const L1_BRIDGE_ABI = [
  "function depositETH(uint32 _minGasLimit, bytes calldata _extraData) external payable",
  "function depositERC20(address _l1Token, address _l2Token, uint256 _amount, uint32 _minGasLimit, bytes calldata _extraData) external",
];

const L2_BRIDGE_ABI = [
  "function withdraw(address _l2Token, uint256 _amount, uint32 _minGasLimit, bytes calldata _extraData) external payable",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

const DEFAULT_GAS_LIMIT = 200000;

export const BRIDGE_DIRECTION = {
  L1_TO_L2: "L1_TO_L2",
  L2_TO_L1: "L2_TO_L1",
};

export const ASSET_TYPE = {
  ETH: "ETH",
  ERC20: "ERC20",
};

export const useMantleBridge = () => {
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [status, setStatus] = useState("");

  const depositETHToMantle = useCallback(async (signer, amountWei) => {
    const bridge = new Contract(
      BRIDGE_CONTRACTS.ethereum.L1StandardBridge,
      L1_BRIDGE_ABI,
      signer,
    );

    const tx = await bridge.depositETH(DEFAULT_GAS_LIMIT, "0x", {
      value: amountWei,
    });

    return tx;
  }, []);

  const depositERC20ToMantle = useCallback(
    async (signer, l1Token, l2Token, amountWei) => {
      const tokenContract = new Contract(l1Token, ERC20_ABI, signer);

      setStatus("Approving token...");
      const allowance = await tokenContract.allowance(
        await signer.getAddress(),
        BRIDGE_CONTRACTS.ethereum.L1StandardBridge,
      );

      if (allowance < amountWei) {
        const approveTx = await tokenContract.approve(
          BRIDGE_CONTRACTS.ethereum.L1StandardBridge,
          amountWei,
        );
        await approveTx.wait();
      }

      setStatus("Depositing ERC20...");
      const bridge = new Contract(
        BRIDGE_CONTRACTS.ethereum.L1StandardBridge,
        L1_BRIDGE_ABI,
        signer,
      );

      const tx = await bridge.depositERC20(
        l1Token,
        l2Token,
        amountWei,
        DEFAULT_GAS_LIMIT,
        "0x",
      );

      return tx;
    },
    [],
  );

  const withdrawETHToEthereum = useCallback(async (signer, amountWei) => {
    const bridge = new Contract(
      BRIDGE_CONTRACTS.mantle.L2StandardBridge,
      L2_BRIDGE_ABI,
      signer,
    );

    const tx = await bridge.withdraw(
      "0x0000000000000000000000000000000000000000",
      amountWei,
      DEFAULT_GAS_LIMIT,
      "0x",
      { value: amountWei },
    );

    return tx;
  }, []);

  const withdrawERC20ToEthereum = useCallback(
    async (signer, l2Token, amountWei) => {
      const bridge = new Contract(
        BRIDGE_CONTRACTS.mantle.L2StandardBridge,
        L2_BRIDGE_ABI,
        signer,
      );

      const tx = await bridge.withdraw(
        l2Token,
        amountWei,
        DEFAULT_GAS_LIMIT,
        "0x",
      );

      return tx;
    },
    [],
  );

  const executeBridge = useCallback(
    async ({
      signer,
      direction,
      assetType,
      amount,
      l1TokenAddress,
      l2TokenAddress,
    }) => {
      try {
        setLoading(true);
        setStatus("Creating secure connection...");

        const amountWei = ethers.parseEther(amount);
        let tx;

        if (assetType === ASSET_TYPE.ETH) {
          if (direction === BRIDGE_DIRECTION.L1_TO_L2) {
            setStatus("Depositing ETH to Mantle...");
            tx = await depositETHToMantle(signer, amountWei);
          } else {
            setStatus("Withdrawing ETH to Ethereum...");
            tx = await withdrawETHToEthereum(signer, amountWei);
          }
        } else if (assetType === ASSET_TYPE.ERC20) {
          if (direction === BRIDGE_DIRECTION.L1_TO_L2) {
            setStatus("Depositing ERC20 to Mantle...");
            tx = await depositERC20ToMantle(
              signer,
              l1TokenAddress,
              l2TokenAddress,
              amountWei,
            );
          } else {
            setStatus("Withdrawing ERC20 to Ethereum...");
            tx = await withdrawERC20ToEthereum(
              signer,
              l2TokenAddress,
              amountWei,
            );
          }
        }

        setTxHash(tx.hash);
        setStatus("Transaction submitted...");

        await tx.wait();

        if (direction === BRIDGE_DIRECTION.L1_TO_L2) {
          setStatus("Bridge completed! Assets arrive in ~10 minutes.");
        } else {
          setStatus("Withdrawal initiated! Claim after 7-day period.");
        }

        return {
          success: true,
          txHash: tx.hash,
          message:
            direction === BRIDGE_DIRECTION.L1_TO_L2
              ? `Bridged ${amount} ${assetType} to Mantle. Arrival in ~10 minutes.`
              : `Withdrawal initiated. Complete on Ethereum after 7-day challenge period.`,
        };
      } catch (error) {
        console.error("[useMantleBridge] Error:", error);
        setStatus("");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [
      depositETHToMantle,
      depositERC20ToMantle,
      withdrawETHToEthereum,
      withdrawERC20ToEthereum,
    ],
  );

  const reset = useCallback(() => {
    setTxHash(null);
    setStatus("");
    setLoading(false);
  }, []);

  return {
    loading,
    txHash,
    status,
    executeBridge,
    reset,
  };
};
