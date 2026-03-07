import { ethers } from "ethers";

/**
 * Convert address to CAIP-10 format
 * https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-10.md
 */
export const formatAddressToCAIP10 = (chainId, address) => {
  return `eip155:${chainId}:${address}`;
};

/**
 * Convert multiple addresses to CAIP-10 format for multiple chains
 */
export const formatAccountsToCAIP10 = (chainIds, address) => {
  return chainIds.map((chainId) => formatAddressToCAIP10(chainId, address));
};

/**
 * Parse CAIP-10 account to get chain ID and address
 */
export const parseCAIP10Account = (account) => {
  const [namespace, chainId, address] = account.split(":");

  if (namespace !== "eip155") {
    throw new Error("Only EIP155 namespace is supported");
  }

  return {
    chainId: parseInt(chainId),
    address,
  };
};

/**
 * Format chain ID to CAIP-2 format
 */
export const formatChainIdToCAIP2 = (chainId) => {
  return `eip155:${chainId}`;
};

/**
 * Get supported chains
 */
export const getSupportedChains = () => {
  return [
    1, // Ethereum Mainnet
    5, // Goerli
    11155111, // Sepolia
    137, // Polygon
    80001, // Mumbai
    56, // BSC
    97, // BSC Testnet
    43114, // Avalanche
    43113, // Avalanche Fuji
    10, // Optimism
    420, // Optimism Goerli
    42161, // Arbitrum One
    421613, // Arbitrum Goerli
  ];
};

/**
 * Get supported methods
 */
export const getSupportedMethods = () => {
  return [
    "eth_sendTransaction",
    "eth_signTransaction",
    "eth_sign",
    "personal_sign",
    "eth_signTypedData",
    "eth_signTypedData_v4",
  ];
};

/**
 * Get supported events
 */
export const getSupportedEvents = () => {
  return ["chainChanged", "accountsChanged"];
};

/**
 * Get chain name from chain ID
 */
export const getChainName = (chainId) => {
  const chainNames = {
    1: "Ethereum",
    5: "Goerli",
    11155111: "Sepolia",
    137: "Polygon",
    80001: "Mumbai",
    56: "BSC",
    97: "BSC Testnet",
    43114: "Avalanche",
    43113: "Avalanche Fuji",
    10: "Optimism",
    420: "Optimism Goerli",
    42161: "Arbitrum One",
    421613: "Arbitrum Goerli",
  };

  return chainNames[chainId] || `Chain ${chainId}`;
};

/**
 * Validate WalletConnect URI
 */
export const isValidWalletConnectURI = (uri) => {
  return uri && uri.startsWith("wc:");
};

/**
 * Format transaction for display
 */
export const formatTransaction = (tx) => {
  return {
    to: tx.to,
    from: tx.from,
    value: tx.value ? ethers.utils.formatEther(tx.value) : "0",
    data: tx.data || "0x",
    gas: tx.gas || tx.gasLimit,
    gasPrice: tx.gasPrice
      ? ethers.utils.formatUnits(tx.gasPrice, "gwei")
      : undefined,
  };
};

/**
 * Truncate address for display
 */
export const truncateAddress = (address, chars = 4) => {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
};

/**
 * Get explorer URL for transaction
 */
export const getExplorerUrl = (chainId, txHash) => {
  const explorers = {
    1: "https://etherscan.io/tx/",
    5: "https://goerli.etherscan.io/tx/",
    11155111: "https://sepolia.etherscan.io/tx/",
    137: "https://polygonscan.com/tx/",
    80001: "https://mumbai.polygonscan.com/tx/",
    56: "https://bscscan.com/tx/",
    97: "https://testnet.bscscan.com/tx/",
    43114: "https://snowtrace.io/tx/",
    43113: "https://testnet.snowtrace.io/tx/",
    10: "https://optimistic.etherscan.io/tx/",
    420: "https://goerli-optimism.etherscan.io/tx/",
    42161: "https://arbiscan.io/tx/",
    421613: "https://goerli.arbiscan.io/tx/",
  };

  const baseUrl = explorers[chainId] || "https://etherscan.io/tx/";
  return `${baseUrl}${txHash}`;
};

/**
 * Build namespaces for session approval
 */
export const buildApprovedNamespaces = (
  requiredNamespaces,
  optionalNamespaces,
  accounts,
) => {
  const namespaces = {};

  // Handle required namespaces
  Object.keys(requiredNamespaces).forEach((key) => {
    namespaces[key] = {
      accounts,
      methods: requiredNamespaces[key].methods,
      events: requiredNamespaces[key].events,
    };
  });

  // Handle optional namespaces
  if (optionalNamespaces) {
    Object.keys(optionalNamespaces).forEach((key) => {
      if (!namespaces[key]) {
        namespaces[key] = {
          accounts,
          methods: optionalNamespaces[key].methods,
          events: optionalNamespaces[key].events,
        };
      } else {
        // Merge with required
        namespaces[key].methods = [
          ...new Set([
            ...namespaces[key].methods,
            ...optionalNamespaces[key].methods,
          ]),
        ];
        namespaces[key].events = [
          ...new Set([
            ...namespaces[key].events,
            ...optionalNamespaces[key].events,
          ]),
        ];
      }
    });
  }

  return namespaces;
};

/**
 * Parse WalletConnect URI
 */
export const parseWalletConnectURI = (uri) => {
  try {
    const url = new URL(uri);
    const topic = url.pathname.split("@")[0].replace("//", "");
    const version = url.pathname.split("@")[1];
    const params = new URLSearchParams(url.search);

    return {
      topic,
      version,
      relay: {
        protocol: params.get("relay-protocol") || "",
        data: params.get("relay-data") || "",
      },
      symKey: params.get("symKey") || "",
    };
  } catch (error) {
    console.error("Failed to parse WalletConnect URI:", error);
    return null;
  }
};
