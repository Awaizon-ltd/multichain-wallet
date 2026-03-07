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
} from "./providers";

// Alchemy SDK utilities
export {
  getAlchemyInstance,
  clearAlchemyCache,
  isAlchemySupported,
  getAlchemySupportedChainIds,
  getAlchemyNetwork,
  ALCHEMY_NETWORK_MAP,
} from "./alchemy";

// Balance utilities
export {
  getNativeBalance,
  getNativeBalancesMultiChain,
  getTokenBalance,
  getAllTokenBalances,
  getAllTokenBalancesMultiChain,
  hasBalance,
} from "./balances";

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
} from "./tokens";

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
} from "./nfts";

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
} from "./gas";

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
} from "./transactions";

// Re-export everything as default for backward compatibility
import * as providers from "./providers";
import * as alchemy from "./alchemy";
import * as balances from "./balances";
import * as tokens from "./tokens";
import * as nfts from "./nfts";
import * as gas from "./gas";
import * as transactions from "./transactions";

export default {
  ...providers,
  ...alchemy,
  ...balances,
  ...tokens,
  ...nfts,
  ...gas,
  ...transactions,
};
