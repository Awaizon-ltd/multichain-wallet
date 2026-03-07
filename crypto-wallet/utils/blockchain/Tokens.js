// utils/tokens.js
import { ethers } from "ethers";
import {
  createProviderForChain,
  createWalletForChain,
  validateChain,
} from "./Providers";
import { getAlchemyInstance } from "./Alchemy";
import { ERC20_ABI } from "../../constants/abi";

/**
 * Get ERC-20 token details
 */
export const getTokenDetails = async (tokenAddress, chain) => {
  try {
    validateChain(chain, "getTokenDetails");

    const MINIMAL_ERC20_ABI = [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function totalSupply() view returns (uint256)",
    ];

    const provider = createProviderForChain(chain);
    const contract = new ethers.Contract(
      tokenAddress,
      MINIMAL_ERC20_ABI,
      provider,
    );

    const [name, symbol, decimals, totalSupply] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
      contract.totalSupply(),
    ]);

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply: totalSupply.toString(),
      chainId: chain.id,
    };
  } catch (error) {
    console.error("[getTokenDetails] Error:", error);
    throw new Error("Invalid token address or network");
  }
};

/**
 * Get token details using Alchemy (more reliable)
 */
export const getTokenDetailsAlchemy = async (tokenAddress, chain) => {
  try {
    validateChain(chain, "getTokenDetailsAlchemy");

    const alchemy = getAlchemyInstance(chain.id);
    const metadata = await alchemy.core.getTokenMetadata(tokenAddress);

    return {
      address: tokenAddress,
      name: metadata.name,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
      logo: metadata.logo,
      chainId: chain.id,
    };
  } catch (error) {
    console.error("[getTokenDetailsAlchemy] Error:", error);
    throw error;
  }
};

/**
 * Get token allowance
 */
export const getTokenAllowance = async (
  tokenAddress,
  owner,
  spender,
  chain,
) => {
  try {
    validateChain(chain, "getTokenAllowance");

    const ALLOWANCE_ABI = [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function decimals() view returns (uint8)",
    ];

    const provider = createProviderForChain(chain);
    const contract = new ethers.Contract(tokenAddress, ALLOWANCE_ABI, provider);

    const [allowance, decimals] = await Promise.all([
      contract.allowance(owner, spender),
      contract.decimals(),
    ]);

    return {
      wei: allowance.toString(),
      formatted: ethers.formatUnits(allowance, decimals),
      decimals: Number(decimals),
    };
  } catch (error) {
    console.error("[getTokenAllowance] Error:", error);
    throw error;
  }
};

/**
 * Approve token spending
 */
export const approveToken = async (
  privateKey,
  tokenAddress,
  spenderAddress,
  amount,
  decimals,
  chain,
) => {
  try {
    validateChain(chain, "approveToken");

    const wallet = createWalletForChain(chain, privateKey);

    const APPROVE_ABI = [
      "function approve(address spender, uint256 amount) returns (bool)",
    ];

    const contract = new ethers.Contract(tokenAddress, APPROVE_ABI, wallet);

    const parsedAmount = ethers.parseUnits(amount, decimals);
    const tx = await contract.approve(spenderAddress, parsedAmount);

    console.log("[approveToken] Approval transaction sent:", tx.hash);
    return tx.hash;
  } catch (error) {
    console.error("[approveToken] Error:", error);
    throw error;
  }
};

/**
 * Send ERC-20 token
 */
export const sendToken = async (
  privateKey,
  tokenAddress,
  toAddress,
  amount,
  decimals,
  chain,
) => {
  try {
    validateChain(chain, "sendToken");

    const wallet = createWalletForChain(chain, privateKey);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

    const tx = await contract.transfer(
      toAddress,
      ethers.parseUnits(amount, decimals),
    );

    console.log("[sendToken] Transfer transaction sent:", tx.hash);
    return tx.hash;
  } catch (error) {
    console.error("[sendToken] Error:", error);
    throw error;
  }
};

/**
 * Get token holders using Alchemy
 */
export const getTokenHolders = async (tokenAddress, chain) => {
  try {
    validateChain(chain, "getTokenHolders");

    const alchemy = getAlchemyInstance(chain.id);
    const holders = await alchemy.core.getTokenTopHolders(tokenAddress);

    return holders;
  } catch (error) {
    console.error("[getTokenHolders] Error:", error);
    throw error;
  }
};

/**
 * Search for tokens by name or symbol
 */
export const searchTokens = async (query, chain) => {
  try {
    validateChain(chain, "searchTokens");

    // This would typically use a token list API
    // For now, we'll return a placeholder
    console.log("[searchTokens] Searching for:", query);

    // TODO: Implement token search using a token list service
    throw new Error("Token search not yet implemented");
  } catch (error) {
    console.error("[searchTokens] Error:", error);
    throw error;
  }
};

/**
 * Validate token address
 */
export const isValidTokenAddress = async (tokenAddress, chain) => {
  try {
    if (!ethers.isAddress(tokenAddress)) {
      return false;
    }

    const details = await getTokenDetails(tokenAddress, chain);
    return details !== null;
  } catch (error) {
    return false;
  }
};

/**
 * Format token amount with symbol
 */
export const formatTokenAmount = (amount, decimals, symbol) => {
  const formatted = ethers.formatUnits(amount, decimals);
  return `${formatted} ${symbol}`;
};

/**
 * Parse token amount to wei
 */
export const parseTokenAmount = (amount, decimals) => {
  return ethers.parseUnits(amount, decimals);
};
