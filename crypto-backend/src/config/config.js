module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Chain IDs mapping — kept in sync with crypto-wallet's constants/Chain.js
  // SUPPORTED_CHAINS. Chains the app doesn't support were removed here along
  // with their now-orphaned tokens/*.json files (optimism, celo, blast,
  // zksync, worldchain, zora, plus the never-wired goerli/kovan/mumbai/
  // rinkeby/ropsten/monad/tempo/unichain/xlayer/solana test data).
  chains: {
    1: "mainnet",
    56: "bnb",
    137: "polygon",
    8453: "base",
    42161: "arbitrum",
    43114: "avalanche",
    11155111: "sepolia", // ← Ethereum Sepolia testnet
    84532: "base-sepolia", // ← Base Sepolia testnet
    5042: "arc",
    4663: "robinhood",
  },

  // Available token lists
  tokenLists: [
    "mainnet",
    "bnb",
    "polygon",
    "base",
    "arbitrum",
    "avalanche",
    "sepolia",
    "base-sepolia",
    "arc",
    "robinhood",
  ],
};
