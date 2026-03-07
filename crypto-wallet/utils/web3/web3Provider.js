import { ethers } from "ethers";
import { Alert } from "react-native";

/**
 * Web3Provider - Handles all Web3 requests from dApps
 */
export class Web3Provider {
  constructor(
    wallet,
    chain,
    provider,
    sendResponseCallback,
    showPasscodeModalCallback,
    handleChainSwitchCallback,
  ) {
    this.wallet = wallet;
    this.chain = chain;
    this.provider = provider;
    this.sendResponse = sendResponseCallback;
    this.showPasscodeModal = showPasscodeModalCallback;
    this.handleChainSwitch = handleChainSwitchCallback;
  }

  /**
   * Handle Web3 requests from dApps
   */
  async handleRequest(id, method, params) {
    console.log(`[Web3Provider] Handling ${method}`);

    try {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return this.handleAccounts(id);

        case "eth_chainId":
          return this.handleChainId(id);

        case "net_version":
          return this.handleNetVersion(id);

        case "eth_blockNumber":
          return this.handleBlockNumber(id);

        case "eth_getBalance":
          return this.handleGetBalance(id, params);

        case "eth_sendTransaction":
          return this.handleSendTransaction(id, params);

        case "personal_sign":
        case "eth_sign":
        case "eth_signTypedData":
        case "eth_signTypedData_v4":
          return this.handleSign(id, method, params);

        case "wallet_switchEthereumChain":
          return this.handleSwitchChain(id, params);

        case "wallet_addEthereumChain":
          return this.handleAddChain(id, params);

        // Read-only RPC calls
        case "eth_call":
        case "eth_estimateGas":
        case "eth_getTransactionCount":
        case "eth_getTransactionReceipt":
        case "eth_getCode":
        case "eth_getStorageAt":
        case "eth_getLogs":
        case "eth_getTransactionByHash":
        case "eth_getBlockByNumber":
        case "eth_getBlockByHash":
          return this.handleReadOnlyRPC(id, method, params);

        default:
          throw new Error(`Method ${method} not supported`);
      }
    } catch (error) {
      this.sendResponse(id, { message: error.message }, null);
    }
  }

  /**
   * Execute pending request after passcode verification
   */
  async executePendingRequest(type, method, params, passcode, createSignerFn) {
    if (type === "transaction") {
      return this.executeTransaction(params, passcode, createSignerFn);
    } else if (type === "sign") {
      return this.executeSign(method, params, passcode, createSignerFn);
    }
    throw new Error("Unknown request type");
  }

  // === Handler Methods ===

  handleAccounts(id) {
    this.sendResponse(id, null, [this.wallet.address]);
  }

  handleChainId(id) {
    this.sendResponse(id, null, `0x${this.chain.id.toString(16)}`);
  }

  handleNetVersion(id) {
    this.sendResponse(id, null, this.chain.id.toString());
  }

  async handleBlockNumber(id) {
    try {
      if (!this.provider) throw new Error("Provider not available");
      const blockNumber = await this.provider.getBlockNumber();
      this.sendResponse(id, null, `0x${blockNumber.toString(16)}`);
    } catch (error) {
      this.sendResponse(id, { message: error.message }, null);
    }
  }

  async handleGetBalance(id, params) {
    try {
      if (!this.provider) throw new Error("Provider not available");
      const balance = await this.provider.getBalance(params[0]);
      this.sendResponse(id, null, `0x${balance.toString(16)}`);
    } catch (error) {
      this.sendResponse(id, { message: error.message }, null);
    }
  }

  async handleReadOnlyRPC(id, method, params) {
    try {
      if (!this.provider) throw new Error("Provider not available");
      const result = await this.provider.send(method, params);
      this.sendResponse(id, null, result);
    } catch (error) {
      this.sendResponse(id, { message: error.message }, null);
    }
  }

  handleSendTransaction(id, params) {
    const txParams = params[0];

    Alert.alert(
      "📝 Confirm Transaction",
      this.formatTransactionDetails(txParams),
      [
        {
          text: "Cancel",
          onPress: () => {
            this.sendResponse(
              id,
              { message: "User rejected transaction" },
              null,
            );
          },
          style: "cancel",
        },
        {
          text: "Confirm",
          onPress: () => {
            // Show passcode modal
            this.showPasscodeModal(id, "transaction", null, txParams);
          },
        },
      ],
    );
  }

  handleSign(id, method, params) {
    const message = method === "personal_sign" ? params[0] : params[1];

    Alert.alert(
      "✍️ Sign Message",
      `A dApp is requesting your signature\n\nMessage: ${this.truncateMessage(message)}`,
      [
        {
          text: "Cancel",
          onPress: () => {
            this.sendResponse(id, { message: "User rejected signature" }, null);
          },
          style: "cancel",
        },
        {
          text: "Sign",
          onPress: () => {
            // Show passcode modal
            this.showPasscodeModal(id, "sign", method, params);
          },
        },
      ],
    );
  }

  handleSwitchChain(id, params) {
    const requestedChainId = parseInt(params[0].chainId, 16);
    this.handleChainSwitch(id, requestedChainId);
  }

  handleAddChain(id, params) {
    const chainData = params[0];

    Alert.alert(
      "Add Network",
      `Add ${chainData.chainName}?\n\nRPC: ${chainData.rpcUrls?.[0] || "Unknown"}\n\nNote: Adding custom networks is not yet supported.`,
      [
        {
          text: "Cancel",
          onPress: () => {
            this.sendResponse(
              id,
              { message: "User rejected network addition" },
              null,
            );
          },
          style: "cancel",
        },
        {
          text: "OK",
          onPress: () => {
            this.sendResponse(
              id,
              { message: "Adding custom networks not yet supported" },
              null,
            );
          },
        },
      ],
    );
  }

  // === Transaction & Signing Execution ===

  async executeTransaction(txParams, passcode, createSignerFn) {
    try {
      const signer = await createSignerFn(passcode);

      const tx = {
        to: txParams.to,
        value: txParams.value || "0x0",
        data: txParams.data || "0x",
        gasLimit: txParams.gas || txParams.gasLimit,
        gasPrice: txParams.gasPrice,
        maxFeePerGas: txParams.maxFeePerGas,
        maxPriorityFeePerGas: txParams.maxPriorityFeePerGas,
      };

      const txResponse = await signer.sendTransaction(tx);
      console.log("[Web3Provider] Transaction sent:", txResponse.hash);

      return txResponse.hash;
    } catch (error) {
      console.error("[Web3Provider] Transaction error:", error);
      throw error;
    }
  }

  async executeSign(method, params, passcode, createSignerFn) {
    try {
      const signer = await createSignerFn(passcode);
      let signature;

      if (method === "personal_sign") {
        const messageBytes = ethers.getBytes(params[0]);
        signature = await signer.signMessage(messageBytes);
      } else if (method === "eth_sign") {
        signature = await signer.signMessage(params[1]);
      } else if (
        method === "eth_signTypedData" ||
        method === "eth_signTypedData_v4"
      ) {
        const typedData =
          typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
        const { domain, types, message: msgData } = typedData;

        const filteredTypes = { ...types };
        delete filteredTypes.EIP712Domain;

        signature = await signer.signTypedData(domain, filteredTypes, msgData);
      }

      return signature;
    } catch (error) {
      console.error("[Web3Provider] Sign error:", error);
      throw error;
    }
  }

  // === Helper Methods ===

  formatTransactionDetails(txParams) {
    const value = txParams.value || "0x0";
    const ethValue = ethers.formatEther(value);
    const to = txParams.to || "Contract Creation";

    let details = `To: ${to}\n\nValue: ${ethValue} ${this.chain.symbol}`;

    if (txParams.data && txParams.data !== "0x") {
      const dataPreview = txParams.data.substring(0, 66);
      details += `\n\nData: ${dataPreview}${txParams.data.length > 66 ? "..." : ""}`;
      details += `\n\n⚠️ This is a contract interaction`;
    }

    return details;
  }

  truncateMessage(message) {
    if (typeof message !== "string") {
      message = JSON.stringify(message);
    }
    return message.length > 100 ? message.substring(0, 100) + "..." : message;
  }
}
