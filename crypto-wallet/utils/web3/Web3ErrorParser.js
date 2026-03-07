// utils/web3/Web3ErrorParser.js

/**
 * Parse and humanize Web3/blockchain errors
 */
export class Web3ErrorParser {
  static ERROR_CODES = {
    // User rejection
    4001: "You cancelled the request",
    ACTION_REJECTED: "You cancelled the request",

    // Network errors
    "-32700": "Invalid request format",
    "-32600": "Invalid request",
    "-32601": "Method not found",
    "-32602": "Invalid parameters",
    "-32603": "Internal error",
    "-32000": "Invalid input",
    "-32001": "Resource not found",
    "-32002": "Resource unavailable",
    "-32003": "Transaction rejected",
    "-32004": "Method not supported",
    "-32005": "Request limit exceeded",

    // Transaction errors
    UNPREDICTABLE_GAS_LIMIT:
      "Unable to estimate gas. The transaction may fail or require manual gas limit.",
    INSUFFICIENT_FUNDS: "Insufficient funds for gas + value",
    NONCE_EXPIRED: "Transaction nonce has expired",
    REPLACEMENT_UNDERPRICED: "Transaction replacement underpriced",
    TRANSACTION_REPLACED: "Transaction was replaced",

    // Contract errors
    CALL_EXCEPTION: "Contract execution failed",
    CONTRACT_NOT_DEPLOYED: "Contract not deployed at this address",

    // Network/RPC errors
    NETWORK_ERROR: "Network connection failed",
    TIMEOUT: "Request timed out",
    SERVER_ERROR: "RPC server error",
  };

  static COMMON_ERROR_PATTERNS = [
    {
      pattern: /insufficient funds/i,
      message: "Insufficient funds",
      description:
        "You don't have enough balance to complete this transaction (including gas fees).",
    },
    {
      pattern: /gas required exceeds allowance|out of gas/i,
      message: "Out of gas",
      description:
        "The transaction ran out of gas. Try increasing the gas limit.",
    },
    {
      pattern: /nonce too low/i,
      message: "Nonce too low",
      description:
        "This transaction nonce has already been used. Try refreshing the page.",
    },
    {
      pattern: /already known|replacement transaction underpriced/i,
      message: "Transaction pending",
      description:
        "A similar transaction is already pending. Wait for it to complete or increase the gas price.",
    },
    {
      pattern: /execution reverted/i,
      message: "Transaction reverted",
      description:
        "The smart contract rejected this transaction. This could be due to failed conditions in the contract.",
    },
    {
      pattern: /user rejected|user denied/i,
      message: "Request cancelled",
      description: "You cancelled this request.",
    },
    {
      pattern: /network changed/i,
      message: "Network changed",
      description: "The network was changed during the transaction.",
    },
    {
      pattern: /invalid address/i,
      message: "Invalid address",
      description: "The provided address is not valid.",
    },
    {
      pattern: /exceeds balance/i,
      message: "Amount exceeds balance",
      description:
        "The amount you're trying to send is more than your available balance.",
    },
    {
      pattern: /slippage/i,
      message: "Slippage tolerance exceeded",
      description:
        "The price changed too much during the transaction. Try adjusting slippage tolerance.",
    },
    {
      pattern: /deadline/i,
      message: "Transaction deadline exceeded",
      description:
        "The transaction took too long and expired. Try again with a longer deadline.",
    },
    {
      pattern: /chain mismatch/i,
      message: "Wrong network",
      description:
        "You're connected to a different network than the dApp expects.",
    },
  ];

  /**
   * Parse and humanize any Web3 error
   */
  static parse(error) {
    if (!error) {
      return {
        title: "Unknown Error",
        message: "An unknown error occurred",
        technical: "",
      };
    }

    // Extract error message
    const errorMessage = this.extractErrorMessage(error);
    const errorCode = this.extractErrorCode(error);

    // Check for known error codes
    if (errorCode && this.ERROR_CODES[errorCode]) {
      return {
        title: "Transaction Failed",
        message: this.ERROR_CODES[errorCode],
        technical: errorMessage,
      };
    }

    // Check for common error patterns
    for (const pattern of this.COMMON_ERROR_PATTERNS) {
      if (pattern.pattern.test(errorMessage)) {
        return {
          title: pattern.message,
          message: pattern.description,
          technical: this.cleanTechnicalMessage(errorMessage),
        };
      }
    }

    // Check for revert reason
    const revertReason = this.extractRevertReason(error);
    if (revertReason) {
      return {
        title: "Transaction Reverted",
        message: revertReason,
        technical: errorMessage,
      };
    }

    // Default fallback
    return {
      title: "Transaction Failed",
      message: this.cleanTechnicalMessage(errorMessage),
      technical: errorMessage,
    };
  }

  /**
   * Extract error message from various error formats
   */
  static extractErrorMessage(error) {
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    if (error.reason) return error.reason;
    if (error.error && error.error.message) return error.error.message;
    if (error.data && error.data.message) return error.data.message;
    return JSON.stringify(error);
  }

  /**
   * Extract error code
   */
  static extractErrorCode(error) {
    if (error.code) return error.code;
    if (error.error && error.error.code) return error.error.code;
    if (error.data && error.data.code) return error.data.code;
    return null;
  }

  /**
   * Extract revert reason from error
   */
  static extractRevertReason(error) {
    const message = this.extractErrorMessage(error);

    // Try to extract reason from various formats
    const patterns = [
      /reason="([^"]+)"/,
      /reason: "([^"]+)"/,
      /reverted with reason string '([^']+)'/,
      /execution reverted: ([^"'\n]+)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        return this.humanizeRevertReason(match[1]);
      }
    }

    return null;
  }

  /**
   * Humanize smart contract revert reasons
   */
  static humanizeRevertReason(reason) {
    // Remove common prefixes
    reason = reason.replace(
      /^(Error: |VM Exception while processing transaction: )/i,
      "",
    );

    // Convert snake_case or camelCase to readable format
    reason = reason
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .trim();

    // Capitalize first letter
    return reason.charAt(0).toUpperCase() + reason.slice(1);
  }

  /**
   * Clean technical message for display
   */
  static cleanTechnicalMessage(message) {
    if (!message) return "";

    // Remove technical jargon
    message = message
      .replace(/Error: /gi, "")
      .replace(/execution reverted:/gi, "")
      .replace(/VM Exception while processing transaction:/gi, "")
      .replace(/revert /gi, "")
      .trim();

    // Truncate if too long
    if (message.length > 200) {
      message = message.substring(0, 200) + "...";
    }

    return message;
  }

  /**
   * Format error for display in Alert
   */
  static formatForAlert(error, includeDetails = false) {
    const parsed = this.parse(error);

    let message = parsed.message;

    if (
      includeDetails &&
      parsed.technical &&
      parsed.technical !== parsed.message
    ) {
      message += `\n\nTechnical details:\n${parsed.technical}`;
    }

    return {
      title: parsed.title,
      message: message,
    };
  }

  /**
   * Get user-friendly method name
   */
  static getMethodName(method) {
    const methodNames = {
      eth_sendTransaction: "Send Transaction",
      personal_sign: "Sign Message",
      eth_signTypedData_v4: "Sign Typed Data",
      eth_signTypedData: "Sign Typed Data",
      eth_sign: "Sign Data",
      eth_requestAccounts: "Connect Wallet",
      wallet_addEthereumChain: "Add Network",
      wallet_switchEthereumChain: "Switch Network",
      eth_accounts: "Get Accounts",
      eth_chainId: "Get Chain ID",
    };

    return methodNames[method] || method;
  }
}
