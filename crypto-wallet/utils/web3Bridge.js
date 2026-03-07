// utils/web3Bridge.js
import { ethers } from "ethers";
import { Alert } from "react-native";

/**
 * Web3 Bridge - Handles communication between WebView and Native wallet
 */
export class Web3Bridge {
  constructor(wallet, chain, sendResponseCallback) {
    this.wallet = wallet;
    this.chain = chain;
    this.sendResponse = sendResponseCallback;
  }

  /**
   * Generate Web3 provider injection script
   */
  getInjectionScript() {
    if (!this.wallet || !this.chain) {
      return "";
    }

    return `
      (function() {
        console.log('[Web3Bridge] Initializing provider...');
        
        const pendingRequests = new Map();
        let requestId = 0;

        window.ethereum = {
          isMetaMask: true,
          isConnected: () => true,
          selectedAddress: "${this.wallet.address}",
          chainId: "0x${this.chain.id.toString(16)}",
          networkVersion: "${this.chain.id}",
          
          request: async ({ method, params = [] }) => {
            console.log('[Web3] Request:', method, params);
            
            const id = requestId++;
            
            return new Promise((resolve, reject) => {
              pendingRequests.set(id, { resolve, reject });
              
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'WEB3_REQUEST',
                id,
                method,
                params
              }));
              
              setTimeout(() => {
                if (pendingRequests.has(id)) {
                  pendingRequests.delete(id);
                  reject(new Error('Request timeout'));
                }
              }, 60000);
            });
          },
          
          handleResponse: (id, error, result) => {
            const pending = pendingRequests.get(id);
            if (pending) {
              pendingRequests.delete(id);
              if (error) {
                pending.reject(error);
              } else {
                pending.resolve(result);
              }
            }
          },
          
          sendAsync: function(payload, callback) {
            this.request({ method: payload.method, params: payload.params })
              .then(result => callback(null, { jsonrpc: '2.0', id: payload.id, result }))
              .catch(error => callback(error, null));
          },
          
          send: function(payload, callback) {
            if (typeof payload === 'string') {
              return this.request({ method: payload, params: callback || [] });
            }
            return this.sendAsync(payload, callback);
          },
          
          enable: async function() {
            return this.request({ method: 'eth_requestAccounts' });
          },
          
          on: function(event, callback) {
            console.log('[Web3] Event listener:', event);
          },
          
          removeListener: function(event, callback) {
            console.log('[Web3] Remove listener:', event);
          }
        };
        
        window.handleWeb3Response = (id, error, result) => {
          window.ethereum.handleResponse(id, error, result);
        };
        
        window.dispatchEvent(new Event('ethereum#initialized'));
        
        console.log('[Web3Bridge] Provider initialized');
        console.log('[Web3Bridge] Address:', window.ethereum.selectedAddress);
        console.log('[Web3Bridge] Chain:', window.ethereum.chainId);
      })();
      
      true;
    `;
  }

  /**
   * Handle Web3 requests from dApps
   */
  async handleRequest(id, method, params) {
    console.log(`[Web3Bridge] Handling ${method}`);

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
          return this.handleReadOnlyRPC(id, method, params);

        default:
          throw new Error(`Method ${method} not supported`);
      }
    } catch (error) {
      this.sendResponse(id, { message: error.message }, null);
    }
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
      const provider = new ethers.JsonRpcProvider(this.chain.rpcUrl);
      const blockNumber = await provider.getBlockNumber();
      this.sendResponse(id, null, `0x${blockNumber.toString(16)}`);
    } catch (error) {
      this.sendResponse(id, { message: error.message }, null);
    }
  }

  async handleGetBalance(id, params) {
    try {
      const provider = new ethers.JsonRpcProvider(this.chain.rpcUrl);
      const balance = await provider.getBalance(params[0]);
      this.sendResponse(id, null, `0x${balance.toString(16)}`);
    } catch (error) {
      this.sendResponse(id, { message: error.message }, null);
    }
  }

  async handleReadOnlyRPC(id, method, params) {
    try {
      const provider = new ethers.JsonRpcProvider(this.chain.rpcUrl);
      const result = await provider.send(method, params);
      this.sendResponse(id, null, result);
    } catch (error) {
      this.sendResponse(id, { message: error.message }, null);
    }
  }

  handleSendTransaction(id, params) {
    const txParams = params[0];

    Alert.alert(
      "Confirm Transaction",
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
          onPress: async () => {
            try {
              const provider = new ethers.JsonRpcProvider(this.chain.rpcUrl);
              const wallet = new ethers.Wallet(
                this.wallet.privateKey,
                provider,
              );

              // Prepare transaction
              const tx = {
                to: txParams.to,
                value: txParams.value || "0x0",
                data: txParams.data || "0x",
                gasLimit: txParams.gas || txParams.gasLimit,
                gasPrice: txParams.gasPrice,
                maxFeePerGas: txParams.maxFeePerGas,
                maxPriorityFeePerGas: txParams.maxPriorityFeePerGas,
              };

              // Send transaction
              const txResponse = await wallet.sendTransaction(tx);
              console.log("[Web3Bridge] Transaction sent:", txResponse.hash);

              this.sendResponse(id, null, txResponse.hash);
            } catch (txError) {
              console.error("[Web3Bridge] Transaction error:", txError);
              this.sendResponse(id, { message: txError.message }, null);
            }
          },
        },
      ],
    );
  }

  handleSign(id, method, params) {
    const message = method === "personal_sign" ? params[0] : params[1];

    Alert.alert(
      "Sign Message",
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
          onPress: async () => {
            try {
              const wallet = new ethers.Wallet(this.wallet.privateKey);
              let signature;

              if (method === "personal_sign") {
                // personal_sign uses raw message
                const messageBytes = ethers.getBytes(params[0]);
                signature = await wallet.signMessage(messageBytes);
              } else if (method === "eth_sign") {
                // eth_sign uses hash
                signature = await wallet.signMessage(params[1]);
              } else if (
                method === "eth_signTypedData" ||
                method === "eth_signTypedData_v4"
              ) {
                // Typed data signing
                const typedData =
                  typeof params[1] === "string"
                    ? JSON.parse(params[1])
                    : params[1];
                const { domain, types, message: msgData } = typedData;

                // Remove EIP712Domain from types if present
                const filteredTypes = { ...types };
                delete filteredTypes.EIP712Domain;

                signature = await wallet.signTypedData(
                  domain,
                  filteredTypes,
                  msgData,
                );
              }

              this.sendResponse(id, null, signature);
            } catch (signError) {
              console.error("[Web3Bridge] Sign error:", signError);
              this.sendResponse(id, { message: signError.message }, null);
            }
          },
        },
      ],
    );
  }

  handleSwitchChain(id, params) {
    const requestedChainId = parseInt(params[0].chainId, 16);

    Alert.alert("Switch Network", `Switch to chain ID: ${requestedChainId}?`, [
      {
        text: "Cancel",
        onPress: () => {
          this.sendResponse(
            id,
            { message: "User rejected network switch" },
            null,
          );
        },
        style: "cancel",
      },
      {
        text: "Switch",
        onPress: () => {
          // TODO: Implement chain switching in wallet context
          // For now, just acknowledge
          this.sendResponse(id, null, null);
        },
      },
    ]);
  }

  handleAddChain(id, params) {
    const chainData = params[0];

    Alert.alert(
      "Add Network",
      `Add ${chainData.chainName}?\n\nRPC: ${chainData.rpcUrls[0]}`,
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
          text: "Add",
          onPress: () => {
            // TODO: Implement chain addition in wallet context
            this.sendResponse(id, null, null);
          },
        },
      ],
    );
  }

  // === Helper Methods ===

  formatTransactionDetails(txParams) {
    const value = txParams.value || "0x0";
    const ethValue = ethers.formatEther(value);
    const to = txParams.to || "Contract Creation";

    let details = `To: ${to}\nValue: ${ethValue} ${this.chain.symbol}`;

    if (txParams.data && txParams.data !== "0x") {
      details += `\nData: ${txParams.data.substring(0, 20)}...`;
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

/**
 * Parse Web3 message from WebView
 */
export const parseWeb3Message = (event) => {
  try {
    const message = JSON.parse(event.nativeEvent.data);

    if (message.type !== "WEB3_REQUEST") {
      return null;
    }

    return {
      id: message.id,
      method: message.method,
      params: message.params || [],
    };
  } catch (error) {
    console.error("[Web3Bridge] Parse error:", error);
    return null;
  }
};

/**
 * Create response script for WebView injection
 */
export const createResponseScript = (id, error, result) => {
  return `
    window.handleWeb3Response(
      ${id},
      ${error ? JSON.stringify(error) : "null"},
      ${result !== null ? JSON.stringify(result) : "null"}
    );
    true;
  `;
};
