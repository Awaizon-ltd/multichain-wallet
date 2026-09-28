// utils/index.js
// Central export file for all blockchain utilities

// Provider utilities
export {
  validateChain,
  createProviderForChain,
  createWalletForChain,
  getProviderSafe,
  getCurrentBlockNumber,
  getNetworkInfo,
} from "./Providers";

// Alchemy SDK utilities
export {
  getAlchemyInstance,
  clearAlchemyCache,
  isAlchemySupported,
  getAlchemySupportedChainIds,
  getAlchemyNetwork,
  ALCHEMY_NETWORK_MAP,
} from "./Alchemy";

// Balance utilities
export {
  getNativeBalance,
  getNativeBalancesMultiChain,
  getTokenBalance,
  getAllTokenBalances,
  getAllTokenBalancesMultiChain,
  hasBalance,
} from "./Balances";

// Token utilities
export {
  getTokenDetails,
  getTokenDetailsAlchemy,
  getTokenAllowance,
  approveToken,
  sendToken,
  getTokenHolders,
  searchTokens,
  isValidTokenAddress,
  formatTokenAmount,
  parseTokenAmount,
} from "./Tokens";

// NFT utilities
export {
  getNFTsForOwner,
  getAllNFTsAcrossChains,
  getAllNFTsAcrossChainsWithPagination,
  getNFTMetadata,
  getNFTContractMetadata,
  getNFTFloorPrice,
  isSpamContract,
  refreshNFTMetadata,
  sendNFT,
  getNFTsForCollection,
  getNFTOwners,
  verifyNFTOwnership,
} from "./NFTs";

// Gas utilities
export {
  getGasPrices,
  getFeeData,
  estimateNativeTransferGas,
  estimateTokenTransferGas,
  estimateNFTTransferGas,
  estimateContractGas,
  calculateTransactionCostUSD,
  getRecommendedGasPrices,
  formatGasPrice,
  parseGasPrice,
  getDefaultGasLimit,
} from "./Gas";

// Transaction utilities
export {
  sendNativeToken,
  getTransactionDetails,
  getTransactionReceipt,
  waitForTransactionReceipt,
  getTransactionHistory,
  getFullTransactionHistory,
  getPendingTransactions,
  replaceTransaction,
  getTransactionCount,
  buildTransaction,
  signTransaction,
  sendRawTransaction,
  decodeTransactionData,
  getTransactionStatus,
} from "./Transaction";

// Re-export everything as default for backward compatibility
import * as providers from "./Providers";
import * as alchemy from "./Alchemy";
import * as balances from "./Balances";
import * as tokens from "./Tokens";
import * as nfts from "./NFTs";
import * as gas from "./Gas";
import * as transactions from "./Transaction";

export default {
  ...providers,
  ...alchemy,
  ...balances,
  ...tokens,
  ...nfts,
  ...gas,
  ...transactions,
};
