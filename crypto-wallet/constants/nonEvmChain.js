// config/chains/nonEvmChains.js
import { ALCHEMY_API_KEY } from "../config/Alchemy";

export const NON_EVM_CHAINS = {
  SOLANA: {
    key: "SOLANA",
    name: "Solana",
    symbol: "SOL",
    rpcUrl: `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    explorer: "https://solscan.io",
    icon: "https://cryptologos.cc/logos/solana-sol-logo.png",
    testnet: false,
    type: "solana",
  },
};
