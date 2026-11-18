// config/chains/nonEvmChains.js
import { ALCHEMY_API_KEY } from "../config/Alchemy";

export const NON_EVM_CHAINS = {
  SOLANA: {
    key: "SOLANA",
    // Non-EVM chains use their key as `id` — the backend's swap/bridge
    // endpoints take chainId=SOLANA and map it to Jupiter / LI.FI.
    id: "SOLANA",
    name: "Solana",
    symbol: "SOL",
    nativeTokenName: "Solana",
    decimals: 9,
    // Native SOL's address in swap/bridge token lists: the wrapped-SOL mint
    // (Jupiter wraps/unwraps automatically, so the user only ever sees SOL).
    nativeMint: "So11111111111111111111111111111111111111112",
    rpcUrl: `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    explorer: "https://solscan.io",
    icon: "https://cryptologos.cc/logos/solana-sol-logo.png",
    testnet: false,
    type: "solana",
  },
};
