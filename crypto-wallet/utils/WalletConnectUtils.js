import { ethers } from "ethers";

/* -------------------------------------------------------------------------- */
/*  Namespaces & Solana chain references                                      */
/* -------------------------------------------------------------------------- */

export const EIP155_NAMESPACE = "eip155";
export const SOLANA_NAMESPACE = "solana";

// CAIP-2 ids: "solana:" + first 32 chars of the cluster's genesis hash
export const SOLANA_CAIP2 = {
  MAINNET: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  DEVNET: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  TESTNET: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
};

const SOLANA_CHAIN_INFO = {
  [SOLANA_CAIP2.MAINNET]: { name: "Solana", cluster: null },
  [SOLANA_CAIP2.DEVNET]: { name: "Solana Devnet", cluster: "devnet" },
  [SOLANA_CAIP2.TESTNET]: { name: "Solana Testnet", cluster: "testnet" },
};

/**
 * Is this a Solana CAIP-2 chain id?
 */
export const isSolanaChain = (chainId) =>
  typeof chainId === "string" && chainId.startsWith(`${SOLANA_NAMESPACE}:`);

/* -------------------------------------------------------------------------- */
/*  CAIP-10 / CAIP-2                                                          */
/* -------------------------------------------------------------------------- */

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
 * Convert a Solana address to CAIP-10 format
 * @param {string} address - base58 address
 * @param {string} caip2 - Solana CAIP-2 id (defaults to mainnet)
 */
export const formatSolanaAddressToCAIP10 = (
  address,
  caip2 = SOLANA_CAIP2.MAINNET,
) => {
  return `${caip2}:${address}`;
};

/**
 * Convert a Solana address to CAIP-10 for several Solana chains
 */
export const formatSolanaAccountsToCAIP10 = (
  address,
  chains = getSupportedSolanaChains(),
) => {
  return chains.map((caip2) => formatSolanaAddressToCAIP10(address, caip2));
};

/**
 * Build the full flat list of CAIP-10 accounts for a wallet that holds
 * both an EVM address and a Solana address.
 */
export const buildAllCAIP10Accounts = ({
  evmAddress,
  solanaAddress,
  evmChainIds = getSupportedChains(),
  solanaChains = getSupportedSolanaChains(),
}) => {
  const accounts = [];
  if (evmAddress) {
    accounts.push(...formatAccountsToCAIP10(evmChainIds, evmAddress));
  }
  if (solanaAddress) {
    accounts.push(...formatSolanaAccountsToCAIP10(solanaAddress, solanaChains));
  }
  return accounts;
};

/**
 * Parse CAIP-10 account to get chain ID and address.
 * For eip155, chainId is a number. For solana, chainId is the string
 * reference (e.g. "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"); use `caip2` for the
 * full chain id.
 */
export const parseCAIP10Account = (account) => {
  const [namespace, reference, address] = account.split(":");

  if (namespace === EIP155_NAMESPACE) {
    return {
      namespace,
      chainId: parseInt(reference, 10),
      caip2: `${namespace}:${reference}`,
      address,
    };
  }

  if (namespace === SOLANA_NAMESPACE) {
    return {
      namespace,
      chainId: reference,
      caip2: `${namespace}:${reference}`,
      address,
    };
  }

  throw new Error(`Unsupported namespace: ${namespace}`);
};

/**
 * Format chain ID to CAIP-2 format
 */
export const formatChainIdToCAIP2 = (chainId) => {
  return `eip155:${chainId}`;
};

/* -------------------------------------------------------------------------- */
/*  Supported chains / methods / events                                       */
/* -------------------------------------------------------------------------- */

/**
 * Get supported EVM chains
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
 * Get supported Solana chains (CAIP-2).
 * Mainnet only, since the app's Solana RPC points at mainnet.
 */
export const getSupportedSolanaChains = () => {
  return [SOLANA_CAIP2.MAINNET];
};

/**
 * Get supported EVM methods
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
 * Get supported Solana methods.
 * Only list methods that have a request handler implemented.
 * (solana_signAndSendTransaction and solana_signAllTransactions are newer
 * additions some dApps use; add them here once handled.)
 */
export const getSupportedSolanaMethods = () => {
  return ["solana_signTransaction", "solana_signMessage"];
};

/**
 * Get supported EVM events
 */
export const getSupportedEvents = () => {
  return ["chainChanged", "accountsChanged"];
};

/**
 * Get supported Solana events (the Solana namespace defines none)
 */
export const getSupportedSolanaEvents = () => {
  return [];
};

const SUPPORTED_BY_NAMESPACE = {
  [EIP155_NAMESPACE]: {
    methods: getSupportedMethods(),
    events: getSupportedEvents(),
  },
  [SOLANA_NAMESPACE]: {
    methods: getSupportedSolanaMethods(),
    events: getSupportedSolanaEvents(),
  },
};

/* -------------------------------------------------------------------------- */
/*  Display helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Get chain name from chain ID.
 * Accepts a numeric EVM chain id or a Solana CAIP-2 string.
 */
export const getChainName = (chainId) => {
  if (isSolanaChain(chainId)) {
    return SOLANA_CHAIN_INFO[chainId]?.name || "Solana";
  }

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
  return typeof uri === "string" && uri.startsWith("wc:");
};

/**
 * Format EVM transaction for display (ethers v6)
 */
export const formatTransaction = (tx) => {
  return {
    to: tx.to,
    from: tx.from,
    value: tx.value ? ethers.formatEther(tx.value) : "0",
    data: tx.data || "0x",
    gas: tx.gas || tx.gasLimit,
    gasPrice: tx.gasPrice ? ethers.formatUnits(tx.gasPrice, "gwei") : undefined,
  };
};

/**
 * Truncate address for display (works for 0x and base58 addresses)
 */
export const truncateAddress = (address, chars = 4) => {
  if (!address) return "";
  const head = address.startsWith("0x") ? chars + 2 : chars;
  return `${address.slice(0, head)}...${address.slice(-chars)}`;
};

/**
 * Get explorer URL for transaction.
 * chainId: numeric EVM chain id or Solana CAIP-2 string.
 * txHash: EVM tx hash or Solana signature.
 */
export const getExplorerUrl = (chainId, txHash) => {
  if (isSolanaChain(chainId)) {
    const cluster = SOLANA_CHAIN_INFO[chainId]?.cluster;
    const suffix = cluster ? `?cluster=${cluster}` : "";
    return `https://solscan.io/tx/${txHash}${suffix}`;
  }

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

/* -------------------------------------------------------------------------- */
/*  Session approval                                                          */
/* -------------------------------------------------------------------------- */

const accountToCAIP2 = (account) => account.split(":").slice(0, 2).join(":");

/**
 * Build namespaces for session approval.
 *
 * @param {object} requiredNamespaces - proposal.params.requiredNamespaces
 * @param {object} optionalNamespaces - proposal.params.optionalNamespaces
 * @param {string[]} accounts - flat CAIP-10 list for ALL the wallet's
 *   accounts (EVM + Solana), e.g. from buildAllCAIP10Accounts()
 *
 * Each namespace only receives its own accounts, limited to the chains the
 * dApp asked for. Methods/events are limited to what the wallet supports.
 * Throws if a required namespace or chain can't be satisfied, so the caller
 * can reject the proposal instead of approving a session that can't work.
 */
export const buildApprovedNamespaces = (
  requiredNamespaces = {},
  optionalNamespaces = {},
  accounts = [],
) => {
  // 1. Merge required + optional requests per namespace
  const merged = {};

  const collect = (source, isRequired) => {
    Object.entries(source || {}).forEach(([key, value]) => {
      const namespace = key.split(":")[0];

      if (!SUPPORTED_BY_NAMESPACE[namespace]) {
        if (isRequired) throw new Error(`Unsupported namespace: ${namespace}`);
        return;
      }

      if (!merged[namespace]) {
        merged[namespace] = {
          required: false,
          chains: new Set(),
          requiredChains: new Set(),
          methods: new Set(),
          events: new Set(),
        };
      }
      const entry = merged[namespace];

      // Key can be a namespace ("eip155") or a single chain ("eip155:1")
      const chains = key.includes(":") ? [key] : value.chains || [];
      chains.forEach((chain) => {
        entry.chains.add(chain);
        if (isRequired) entry.requiredChains.add(chain);
      });
      (value.methods || []).forEach((m) => entry.methods.add(m));
      (value.events || []).forEach((e) => entry.events.add(e));
      if (isRequired) entry.required = true;
    });
  };

  collect(requiredNamespaces, true);
  collect(optionalNamespaces, false);

  // 2. Build the approved namespaces from the wallet's accounts
  const approved = {};

  Object.entries(merged).forEach(([namespace, entry]) => {
    const supported = SUPPORTED_BY_NAMESPACE[namespace];

    const namespaceAccounts = accounts.filter(
      (account) =>
        account.startsWith(`${namespace}:`) &&
        (entry.chains.size === 0 || entry.chains.has(accountToCAIP2(account))),
    );
    const coveredChains = new Set(namespaceAccounts.map(accountToCAIP2));

    for (const chain of entry.requiredChains) {
      if (!coveredChains.has(chain)) {
        throw new Error(`Required chain not supported: ${chain}`);
      }
    }

    if (namespaceAccounts.length === 0) {
      if (entry.required) {
        throw new Error(`No accounts for required namespace: ${namespace}`);
      }
      return;
    }

    approved[namespace] = {
      chains: [...coveredChains],
      accounts: namespaceAccounts,
      methods: [...entry.methods].filter((m) => supported.methods.includes(m)),
      events: [...entry.events].filter((e) => supported.events.includes(e)),
    };
  });

  return approved;
};

/* -------------------------------------------------------------------------- */
/*  URI parsing                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Parse WalletConnect URI (wc:{topic}@{version}?relay-protocol=...&symKey=...)
 * Parsed by hand: React Native's built-in URL/URLSearchParams is only
 * partially implemented and unreliable for non-http schemes.
 */
export const parseWalletConnectURI = (uri) => {
  try {
    if (!isValidWalletConnectURI(uri)) return null;

    const [base, query = ""] = uri.slice("wc:".length).split("?");
    const [rawTopic, version] = base.split("@");
    const topic = rawTopic.replace(/^\/\//, "");

    const params = {};
    query.split("&").forEach((pair) => {
      if (!pair) return;
      const [key, ...rest] = pair.split("=");
      params[decodeURIComponent(key)] = decodeURIComponent(rest.join("="));
    });

    return {
      topic,
      version,
      relay: {
        protocol: params["relay-protocol"] || "",
        data: params["relay-data"] || "",
      },
      symKey: params["symKey"] || "",
    };
  } catch (error) {
    console.error("Failed to parse WalletConnect URI:", error);
    return null;
  }
};
