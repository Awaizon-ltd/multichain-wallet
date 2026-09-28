import { Alchemy, Network } from "alchemy-sdk";

// Alchemy API key
const ALCHEMY_KEY = "tlYzVPHTMFIk9YDQyrzrQ";

// Network configurations for Alchemy SDK
const ALCHEMY_NETWORKS = {
  ethereum: Network.ETH_MAINNET,
  bsc: Network.BNB_MAINNET,
  polygon: Network.MATIC_MAINNET,
  arbitrum: Network.ARB_MAINNET,
  optimism: Network.OPT_MAINNET,
  base: Network.BASE_MAINNET,
  // Arc / Robinhood Chain aren't in alchemy-sdk's Network enum yet (too new).
  zetachain: Network.ZETACHAIN_MAINNET,
  hyperliquid: Network.HYPERLIQUID_MAINNET,
  abstract: Network.ABSTRACT_MAINNET,
};

// Creates an Alchemy SDK instance for any chain
export function createAlchemy(chainKey) {
  const network = ALCHEMY_NETWORKS[chainKey];
  if (!network)
    throw new Error(`Alchemy network not found for chain: ${chainKey}`);
  return new Alchemy({ apiKey: ALCHEMY_KEY, network });
}

// Creates all providers
export function createProviders() {
  const providers = {};

  Object.keys(ALCHEMY_NETWORKS).forEach((chain) => {
    try {
      providers[chain] = createAlchemy(chain);
    } catch (error) {
      console.error(`Failed to create Alchemy SDK for ${chain}:`, error);
    }
  });

  return providers;
}

export { ALCHEMY_KEY, ALCHEMY_NETWORKS };
