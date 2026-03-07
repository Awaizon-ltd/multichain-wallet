// utils/balances.js
import { ethers } from "ethers";
import { createProviderForChain, validateChain } from "./Providers";
import { getAlchemyInstance } from "./Alchemy";

/**
 * Get native token balance
 */
export const getNativeBalance = async (address, chain) => {
  try {
    validateChain(chain, "getNativeBalance");

    const provider = createProviderForChain(chain);
    const balance = await provider.getBalance(address);

    return {
      wei: balance.toString(),
      formatted: ethers.formatEther(balance),
      symbol: chain.symbol,
      decimals: 18,
    };
  } catch (error) {
    console.error("[getNativeBalance] Error:", error);
    throw error;
  }
};

/**
 * Get native balances for multiple chains
 */
export const getNativeBalancesMultiChain = async (address, chains) => {
  try {
    console.log(
      "[getNativeBalancesMultiChain] Fetching balances for:",
      address,
    );

    const balancePromises = chains.map(async (chain) => {
      try {
        const balance = await getNativeBalance(address, chain);
        return {
          chainId: chain.id,
          chainName: chain.name,
          ...balance,
        };
      } catch (error) {
        console.error(
          `[getNativeBalancesMultiChain] Error for ${chain.name}:`,
          error,
        );
        return {
          chainId: chain.id,
          chainName: chain.name,
          wei: "0",
          formatted: "0",
          symbol: chain.symbol,
          decimals: 18,
          error: error.message,
        };
      }
    });

    const balances = await Promise.all(balancePromises);

    // Return as object keyed by chainId
    return balances.reduce((acc, balance) => {
      acc[balance.chainId] = balance;
      return acc;
    }, {});
  } catch (error) {
    console.error("[getNativeBalancesMultiChain] Error:", error);
    throw error;
  }
};

/**
 * Get ERC-20 token balance
 */
export const getTokenBalance = async (tokenAddress, walletAddress, chain) => {
  try {
    validateChain(chain, "getTokenBalance");

    const MINIMAL_ERC20_ABI = [
      "function balanceOf(address) view returns (uint256)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
    ];

    const provider = createProviderForChain(chain);
    const contract = new ethers.Contract(
      tokenAddress,
      MINIMAL_ERC20_ABI,
      provider,
    );

    const [balance, decimals, symbol] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
      contract.symbol(),
    ]);

    return {
      wei: balance.toString(),
      formatted: ethers.formatUnits(balance, decimals),
      symbol,
      decimals: Number(decimals),
      address: tokenAddress,
    };
  } catch (error) {
    console.error("[getTokenBalance] Error:", error);
    throw error;
  }
};

// ============================================================================
// TOKEN BALANCE UTILITIES (Enhanced API + Fallback)
// ============================================================================

// List of chains that don't support Alchemy Enhanced APIs
const CHAINS_WITHOUT_EAPI_SUPPORT = [
  5000, // Mantle Mainnet
  5001, // Mantle Testnet
  // Add other unsupported chains as needed
];

// Known tokens for chains without Enhanced API support
const KNOWN_TOKENS = {
  5000: [
    // Mantle Mainnet
    {
      address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
    {
      address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
    },
    {
      address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111",
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
    },
    {
      address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8",
      symbol: "WMNT",
      name: "Wrapped Mantle",
      decimals: 18,
    },
  ],
  5001: [
    // Mantle Testnet
    {
      address: "0x5C48e07062CCEbB1Db4786f5ca569887F4E39Df7",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
  ],
  // Add other chains here as needed
};

/**
 * Fallback: Manual token balance fetching for chains without EAPI support
 */
const getTokenBalancesManually = async (address, chain) => {
  try {
    const provider = createProviderForChain(chain);

    const knownTokens = KNOWN_TOKENS[chain.id] || [];

    if (knownTokens.length === 0) {
      console.warn(
        `[getTokenBalancesManually] No known tokens configured for chain ${chain.name} (${chain.id})`,
      );
      return [];
    }

    const ERC20_ABI = [
      "function balanceOf(address) view returns (uint256)",
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
    ];

    const tokensWithBalances = await Promise.all(
      knownTokens.map(async (tokenInfo) => {
        try {
          const contract = new ethers.Contract(
            tokenInfo.address,
            ERC20_ABI,
            provider,
          );

          const balance = await contract.balanceOf(address);

          // Skip if balance is zero
          if (balance === 0n || balance.toString() === "0") {
            return null;
          }

          // Try to fetch metadata if not provided
          let name = tokenInfo.name;
          let symbol = tokenInfo.symbol;
          let decimals = tokenInfo.decimals;

          if (!name || !symbol || !decimals) {
            try {
              [name, symbol, decimals] = await Promise.all([
                contract.name(),
                contract.symbol(),
                contract.decimals(),
              ]);
            } catch (metadataError) {
              console.warn(
                `[getTokenBalancesManually] Could not fetch metadata for ${tokenInfo.address}`,
              );
            }
          }

          return {
            address: tokenInfo.address,
            balance: balance.toString(),
            formatted: ethers.formatUnits(balance, decimals || 18),
            name: name || "Unknown Token",
            symbol: symbol || "???",
            decimals: decimals || 18,
            logo: null, // No logo available in manual mode
          };
        } catch (err) {
          console.error(
            `[getTokenBalancesManually] Error fetching balance for ${tokenInfo.address}:`,
            err,
          );
          return null;
        }
      }),
    );

    return tokensWithBalances.filter((token) => token !== null);
  } catch (error) {
    console.error("[getTokenBalancesManually] Error:", error);
    return [];
  }
};

/**
 * Get all token balances for an address (with Enhanced API + Fallback)
 */
export const getAllTokenBalances = async (address, chain) => {
  try {
    validateChain(chain, "getAllTokenBalances");

    // Check if chain supports Alchemy Enhanced APIs
    const supportsEAPI = !CHAINS_WITHOUT_EAPI_SUPPORT.includes(chain.id);

    if (!supportsEAPI) {
      console.log(
        `[getAllTokenBalances] Chain ${chain.name} (${chain.id}) doesn't support Alchemy EAPIs, using manual method...`,
      );
      return await getTokenBalancesManually(address, chain);
    }

    // Use Alchemy Enhanced API for supported chains
    const alchemy = getAlchemyInstance(chain.id);

    let balances;
    try {
      balances = await alchemy.core.getTokenBalances(address);
    } catch (alchemyError) {
      // If we get an EAPI error even though chain should be supported, fallback
      if (
        alchemyError.message?.includes("EAPIs not enabled") ||
        alchemyError.message?.includes("EAPI")
      ) {
        console.warn(
          `[getAllTokenBalances] EAPI not available for ${chain.name}, falling back to manual method...`,
        );
        return await getTokenBalancesManually(address, chain);
      }
      throw alchemyError;
    }

    const nonZeroBalances = balances.tokenBalances.filter(
      (token) => token.tokenBalance !== "0" && token.tokenBalance !== "0x0",
    );

    const tokensWithMetadata = await Promise.all(
      nonZeroBalances.map(async (token) => {
        try {
          const metadata = await alchemy.core.getTokenMetadata(
            token.contractAddress,
          );

          return {
            address: token.contractAddress,
            balance: token.tokenBalance,
            formatted: ethers.formatUnits(
              token.tokenBalance || "0",
              metadata.decimals || 18,
            ),
            name: metadata.name,
            symbol: metadata.symbol,
            decimals: metadata.decimals || 18,
            logo: metadata.logo,
          };
        } catch (err) {
          console.error(
            "[getAllTokenBalances] Error fetching token metadata:",
            err,
          );
          return null;
        }
      }),
    );

    return tokensWithMetadata.filter((token) => token !== null);
  } catch (error) {
    console.error("[getAllTokenBalances] Error:", error);
    return [];
  }
};

/**
 * Get all token balances across multiple chains
 */
export const getAllTokenBalancesMultiChain = async (address, chains) => {
  try {
    console.log(
      "[getAllTokenBalancesMultiChain] Fetching tokens for:",
      address,
    );

    const tokenPromises = chains.map(async (chain) => {
      try {
        const tokens = await getAllTokenBalances(address, chain);
        return {
          chainId: chain.id,
          chainName: chain.name,
          tokens,
        };
      } catch (error) {
        console.error(
          `[getAllTokenBalancesMultiChain] Error for ${chain.name}:`,
          error,
        );
        return {
          chainId: chain.id,
          chainName: chain.name,
          tokens: [],
          error: error.message,
        };
      }
    });

    const results = await Promise.all(tokenPromises);

    // Return as object keyed by chainId
    return results.reduce((acc, result) => {
      acc[result.chainId] = result.tokens;
      return acc;
    }, {});
  } catch (error) {
    console.error("[getAllTokenBalancesMultiChain] Error:", error);
    throw error;
  }
};

/**
 * Check if address has balance (native or tokens)
 */
export const hasBalance = async (address, chain) => {
  try {
    validateChain(chain, "hasBalance");

    // Check native balance
    const nativeBalance = await getNativeBalance(address, chain);
    if (parseFloat(nativeBalance.formatted) > 0) {
      return true;
    }

    // Check token balances
    const tokens = await getAllTokenBalances(address, chain);
    return tokens.length > 0;
  } catch (error) {
    console.error("[hasBalance] Error:", error);
    return false;
  }
};
