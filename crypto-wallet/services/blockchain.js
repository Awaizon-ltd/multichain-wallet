// utils/Blockchain.js
import { Alchemy, Network } from 'alchemy-sdk';
import { ethers } from 'ethers';
import { SUPPORTED_CHAINS } from '../constants/Chain';
import { ERC20_ABI } from '../constants/abi';
import {
  getNativeBalance as getCachedNativeBalance,
  getTokenBalance as getCachedTokenBalance,
} from '../utils/blockchain/Balances';

// Alchemy API Keys
const ALCHEMY_API_KEYS = {
  ethereum: "HMY8NYYFL2K15hNmFFxK3",
  polygon: "HMY8NYYFL2K15hNmFFxK3",
  arbitrum: "HMY8NYYFL2K15hNmFFxK3",
  optimism: "HMY8NYYFL2K15hNmFFxK3",
  base: "HMY8NYYFL2K15hNmFFxK3",

};

// Map chain IDs to Alchemy Networks
const ALCHEMY_NETWORK_MAP = {
  1: Network.ETH_MAINNET,
  137: Network.MATIC_MAINNET,
  42161: Network.ARB_MAINNET,
  10: Network.OPT_MAINNET,
  8453: Network.BASE_MAINNET,
   56:Network.BNB_MAINNET,
};

/**
 * Validate chain object
 */
const validateChain = (chain, functionName) => {
  console.log(`[${functionName}] Received chain:`, chain);
  
  if (!chain) {
    throw new Error(`[${functionName}] Chain object is undefined or null`);
  }
  
  if (!chain.id) {
    console.error(`[${functionName}] Chain object missing 'id' property:`, JSON.stringify(chain));
    throw new Error(`[${functionName}] Chain object is missing 'id' property`);
  }
  
  console.log(`[${functionName}] Chain ID:`, chain.id);
  return true;
};

/**
 * Get Alchemy instance for a specific chain
 */
export const getAlchemyInstance = (chainId) => {
  console.log('[getAlchemyInstance] Received chainId:', chainId, 'Type:', typeof chainId);
  
  const network = ALCHEMY_NETWORK_MAP[chainId];
  
  if (!network) {
    console.error('[getAlchemyInstance] Available chain IDs:', Object.keys(ALCHEMY_NETWORK_MAP));
    throw new Error(`Alchemy not supported for chain ${chainId}`);
  }

  const apiKey = Object.values(ALCHEMY_API_KEYS)[0];
  console.log('[getAlchemyInstance] Creating Alchemy instance for network:', network);
  
  return new Alchemy({
    apiKey,
    network,
  });
};

/**
 * Create provider for reading blockchain data
 */
export const createProviderForChain = (chain) => {
  validateChain(chain, 'createProviderForChain');
  return new ethers.JsonRpcProvider(chain.rpcUrl);
};

/**
 * Create wallet for signing transactions
 */
export const createWalletForChain = (chain, privateKey) => {
  validateChain(chain, 'createWalletForChain');
  const provider = createProviderForChain(chain);
  return new ethers.Wallet(privateKey, provider);
};

/**
 * Get native token balance.
 * Routes through utils/blockchain/Balances.js's cached implementation
 * (30s TTL, stale-while-revalidate) instead of calling the provider directly —
 * this file used to be a completely uncached duplicate of that module.
 */
export const getNativeBalance = async (address, chain) => {
  try {
    validateChain(chain, 'getNativeBalance');
    return await getCachedNativeBalance(address, chain);
  } catch (error) {
    console.error('Error fetching native balance:', error);
    throw error;
  }
};

/**
 * Get ERC-20 token details
 */
export const getTokenDetails = async (tokenAddress, chain) => {
  try {
    validateChain(chain, 'getTokenDetails');
    
    const MINIMAL_ERC20_ABI = [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function totalSupply() view returns (uint256)',
    ];

    const provider = createProviderForChain(chain);
    const contract = new ethers.Contract(tokenAddress, MINIMAL_ERC20_ABI, provider);

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
    console.error('[getTokenDetails] Error:', error);
    throw new Error('Invalid token address or network');
  }
};

/**
 * Get ERC-20 token balance.
 * Routes through utils/blockchain/Balances.js's cached implementation
 * (30s TTL) instead of an uncached direct contract call.
 */
export const getTokenBalance = async (tokenAddress, walletAddress, chain) => {
  try {
    validateChain(chain, 'getTokenBalance');
    return await getCachedTokenBalance(tokenAddress, walletAddress, chain);
  } catch (error) {
    console.error('[getTokenBalance] Error:', error);
    throw error;
  }
};

/**
 * Get all token balances for an address using Alchemy
 */
export const getAllTokenBalances = async (address, chain) => {
  try {
    validateChain(chain, 'getAllTokenBalances');
    
    const alchemy = getAlchemyInstance(chain.id);
    const balances = await alchemy.core.getTokenBalances(address);

    const nonZeroBalances = balances.tokenBalances.filter(
      token => token.tokenBalance !== '0'
    );

    const tokensWithMetadata = await Promise.all(
      nonZeroBalances.map(async (token) => {
        try {
          const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);
          
          return {
            address: token.contractAddress,
            balance: token.tokenBalance,
            formatted: ethers.formatUnits(
              token.tokenBalance || '0',
              metadata.decimals || 18
            ),
            name: metadata.name,
            symbol: metadata.symbol,
            decimals: metadata.decimals || 18,
            logo: metadata.logo,
          };
        } catch (err) {
          console.error('Error fetching token metadata:', err);
          return null;
        }
      })
    );

    return tokensWithMetadata.filter(token => token !== null);
  } catch (error) {
    console.error('Error fetching all token balances:', error);
    return [];
  }
};

/**
 * Send native token (ETH, POL, etc.)
 */
export const sendNativeToken = async (privateKey, toAddress, amount, chain) => {
  try {
    validateChain(chain, 'sendNativeToken');
    
    const wallet = createWalletForChain(chain, privateKey);
    
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(amount),
    });

    return tx.hash;
  } catch (error) {
    console.error('Error sending native token:', error);
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
  chain
) => {
  try {
    validateChain(chain, 'sendToken');
    
    const wallet = createWalletForChain(chain, privateKey);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

    const tx = await contract.transfer(
      toAddress,
      ethers.parseUnits(amount, decimals)
    );

    return tx.hash;
  } catch (error) {
    console.error('Error sending token:', error);
    throw error;
  }
};

/**
 * Estimate gas for native token transfer
 */
export const estimateNativeTransferGas = async (fromAddress, toAddress, amount, chain) => {
  try {
    validateChain(chain, 'estimateNativeTransferGas');
    
    const provider = createProviderForChain(chain);
    
    const gasEstimate = await provider.estimateGas({
      from: fromAddress,
      to: toAddress,
      value: ethers.parseEther(amount),
    });

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    return {
      gasLimit: gasEstimate.toString(),
      gasPrice: gasPrice.toString(),
      gasPriceGwei: ethers.formatUnits(gasPrice, 'gwei'),
      totalCost: ethers.formatEther(gasEstimate * gasPrice),
      totalCostWei: (gasEstimate * gasPrice).toString(),
    };
  } catch (error) {
    console.error('Error estimating gas:', error);
    throw error;
  }
};

/**
 * Estimate gas for token transfer
 */
export const estimateTokenTransferGas = async (
  fromAddress,
  tokenAddress,
  toAddress,
  amount,
  decimals,
  chain
) => {
  try {
    validateChain(chain, 'estimateTokenTransferGas');
    
    const provider = createProviderForChain(chain);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    const gasEstimate = await contract.transfer.estimateGas(
      toAddress,
      ethers.parseUnits(amount, decimals),
      { from: fromAddress }
    );

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    return {
      gasLimit: gasEstimate.toString(),
      gasPrice: gasPrice.toString(),
      gasPriceGwei: ethers.formatUnits(gasPrice, 'gwei'),
      totalCost: ethers.formatEther(gasEstimate * gasPrice),
      totalCostWei: (gasEstimate * gasPrice).toString(),
    };
  } catch (error) {
    console.error('Error estimating token transfer gas:', error);
    throw error;
  }
};

/**
 * Wait for transaction confirmation
 */
export const waitForTransactionReceipt = async (txHash, chain) => {
  try {
    validateChain(chain, 'waitForTransactionReceipt');
    
    const provider = createProviderForChain(chain);
    const receipt = await provider.waitForTransaction(txHash, 1);

    return {
      status: receipt.status === 1 ? 'success' : 'failed',
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      transactionHash: receipt.hash,
    };
  } catch (error) {
    console.error('Error waiting for transaction:', error);
    throw error;
  }
};

/**
 * Get all NFTs owned by an address across ALL supported chains
 */
export const getAllNFTsAcrossChains = async (ownerAddress) => {
  try {
    console.log('[getAllNFTsAcrossChains] Fetching NFTs for:', ownerAddress);
    
    const alchemySupportedChains = Object.values(SUPPORTED_CHAINS).filter(
      chain => ALCHEMY_NETWORK_MAP[chain.id]
    );
    
    console.log('[getAllNFTsAcrossChains] Checking chains:', 
      alchemySupportedChains.map(c => c.name)
    );

    const nftPromises = alchemySupportedChains.map(async (chain) => {
      try {
        console.log(`[getAllNFTsAcrossChains] Fetching from ${chain.name}...`);
        
        const alchemy = getAlchemyInstance(chain.id);
        const nfts = await alchemy.nft.getNftsForOwner(ownerAddress, {
          excludeFilters: ['SPAM'],
        });

        console.log(`[getAllNFTsAcrossChains] ${chain.name}: Found ${nfts.totalCount} NFTs`);

        return {
          chain: {
            id: chain.id,
            name: chain.name,
            symbol: chain.symbol,
            icon: chain.icon,
            explorer: chain.explorer,
          },
          nfts: nfts.ownedNfts.map(nft => ({
            ...nft,
            chainId: chain.id,
            chainName: chain.name,
          })),
          totalCount: nfts.totalCount,
        };
      } catch (error) {
        console.error(`[getAllNFTsAcrossChains] Error fetching from ${chain.name}:`, error);
        return {
          chain: {
            id: chain.id,
            name: chain.name,
            symbol: chain.symbol,
            icon: chain.icon,
            explorer: chain.explorer,
          },
          nfts: [],
          totalCount: 0,
          error: error.message,
        };
      }
    });

    const results = await Promise.all(nftPromises);
    const allNFTs = results.flatMap(result => result.nfts);
    const totalCount = results.reduce((sum, result) => sum + result.totalCount, 0);

    console.log('[getAllNFTsAcrossChains] Total NFTs across all chains:', totalCount);

    return {
      nfts: allNFTs,
      totalCount,
      byChain: results,
      chains: alchemySupportedChains.map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
      })),
    };
  } catch (error) {
    console.error('[getAllNFTsAcrossChains] Fatal error:', error);
    throw error;
  }
};

/**
 * Get NFTs with pagination across all chains
 */
export const getAllNFTsAcrossChainsWithPagination = async (ownerAddress, pageSize = 10) => {
  try {
    console.log('[getAllNFTsAcrossChainsWithPagination] Fetching NFTs for:', ownerAddress);
    
    const alchemySupportedChains = Object.values(SUPPORTED_CHAINS).filter(
      chain => ALCHEMY_NETWORK_MAP[chain.id]
    );

    const nftPromises = alchemySupportedChains.map(async (chain) => {
      try {
        const alchemy = getAlchemyInstance(chain.id);
        const nfts = await alchemy.nft.getNftsForOwner(ownerAddress, {
          excludeFilters: ['SPAM'],
          pageSize,
        });

        return {
          chain: {
            id: chain.id,
            name: chain.name,
            symbol: chain.symbol,
            icon: chain.icon,
            explorer: chain.explorer,
          },
          nfts: nfts.ownedNfts.map(nft => ({
            ...nft,
            chainId: chain.id,
            chainName: chain.name,
          })),
          totalCount: nfts.totalCount,
          pageKey: nfts.pageKey,
        };
      } catch (error) {
        console.error(`Error fetching from ${chain.name}:`, error);
        return {
          chain: {
            id: chain.id,
            name: chain.name,
            symbol: chain.symbol,
            icon: chain.icon,
            explorer: chain.explorer,
          },
          nfts: [],
          totalCount: 0,
          error: error.message,
        };
      }
    });

    const results = await Promise.all(nftPromises);
    const allNFTs = results.flatMap(result => result.nfts);
    const totalCount = results.reduce((sum, result) => sum + result.totalCount, 0);

    return {
      nfts: allNFTs,
      totalCount,
      byChain: results,
      hasMore: results.some(result => result.pageKey),
    };
  } catch (error) {
    console.error('[getAllNFTsAcrossChainsWithPagination] Error:', error);
    throw error;
  }
};

/**
 * Get transaction details
 */
export const getTransactionDetails = async (txHash, chain) => {
  try {
    validateChain(chain, 'getTransactionDetails');
    
    const provider = createProviderForChain(chain);
    const transaction = await provider.getTransaction(txHash);

    return {
      hash: transaction.hash,
      from: transaction.from,
      to: transaction.to,
      value: ethers.formatEther(transaction.value),
      gasPrice: transaction.gasPrice?.toString(),
      gasLimit: transaction.gasLimit?.toString(),
      nonce: transaction.nonce,
      blockNumber: transaction.blockNumber?.toString(),
      status: 'pending',
    };
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    throw error;
  }
};

/**
 * Get transaction history using Alchemy
 */
export const getTransactionHistory = async (address, chain, limit = 20) => {
  try {
    validateChain(chain, 'getTransactionHistory');
    
    const alchemy = getAlchemyInstance(chain.id);
    
    const history = await alchemy.core.getAssetTransfers({
      fromAddress: address,
      category: ['external', 'internal', 'erc20', 'erc721', 'erc1155'],
      maxCount: limit,
      order: 'desc',
    });

    const sentTxs = history.transfers;

    const receivedHistory = await alchemy.core.getAssetTransfers({
      toAddress: address,
      category: ['external', 'internal', 'erc20', 'erc721', 'erc1155'],
      maxCount: limit,
      order: 'desc',
    });

    const receivedTxs = receivedHistory.transfers;

    const allTxs = [...sentTxs, ...receivedTxs].sort((a, b) => {
      return (b.blockNum || 0) - (a.blockNum || 0);
    });

    const uniqueTxs = Array.from(
      new Map(allTxs.map(tx => [tx.hash, tx])).values()
    );

    return uniqueTxs.slice(0, limit).map(tx => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value?.toString() || '0',
      asset: tx.asset || chain.symbol,
      category: tx.category,
      blockNumber: tx.blockNum?.toString(),
      timestamp: tx.metadata?.blockTimestamp,
      tokenAddress: tx.rawContract?.address,
    }));
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return [];
  }
};

/**
 * Get current gas prices
 */
export const getGasPrices = async (chain) => {
  try {
    validateChain(chain, 'getGasPrices');
    
    const provider = createProviderForChain(chain);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    const basePrice = gasPrice;
    
    return {
      slow: {
        gasPrice: basePrice,
        gwei: ethers.formatUnits(basePrice, 'gwei'),
      },
      standard: {
        gasPrice: (basePrice * 12n) / 10n,
        gwei: ethers.formatUnits((basePrice * 12n) / 10n, 'gwei'),
      },
      fast: {
        gasPrice: (basePrice * 15n) / 10n,
        gwei: ethers.formatUnits((basePrice * 15n) / 10n, 'gwei'),
      },
    };
  } catch (error) {
    console.error('Error fetching gas prices:', error);
    throw error;
  }
};

/**
 * Estimate gas for NFT transfer (ERC-721 or ERC-1155)
 */
export const estimateNFTTransferGas = async (
  fromAddress,
  contractAddress,
  toAddress,
  tokenId,
  tokenType = 'ERC721',
  chain
) => {
  try {
    validateChain(chain, 'estimateNFTTransferGas');
    
    const provider = createProviderForChain(chain);
    
    const ERC721_TRANSFER_ABI = [
      'function transferFrom(address from, address to, uint256 tokenId)',
    ];

    const ERC1155_TRANSFER_ABI = [
      'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
    ];

    const abi = tokenType === 'ERC1155' ? ERC1155_TRANSFER_ABI : ERC721_TRANSFER_ABI;
    const contract = new ethers.Contract(contractAddress, abi, provider);

    let gasEstimate;
    if (tokenType === 'ERC1155') {
      gasEstimate = await contract.safeTransferFrom.estimateGas(
        fromAddress,
        toAddress,
        tokenId,
        1,
        '0x',
        { from: fromAddress }
      );
    } else {
      gasEstimate = await contract.transferFrom.estimateGas(
        fromAddress,
        toAddress,
        tokenId,
        { from: fromAddress }
      );
    }

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;

    return {
      gasLimit: gasEstimate.toString(),
      gasPrice: gasPrice.toString(),
      gasPriceGwei: ethers.formatUnits(gasPrice, 'gwei'),
      totalCost: ethers.formatEther(gasEstimate * gasPrice),
      totalCostWei: (gasEstimate * gasPrice).toString(),
    };
  } catch (error) {
    console.error('[estimateNFTTransferGas] Error:', error);
    throw error;
  }
};

/**
 * Send NFT (ERC-721 or ERC-1155)
 */
export const sendNFT = async (
  privateKey,
  contractAddress,
  toAddress,
  tokenId,
  tokenType = 'ERC721',
  chain
) => {
  try {
    validateChain(chain, 'sendNFT');
    
    const wallet = createWalletForChain(chain, privateKey);

    const ERC721_TRANSFER_ABI = [
      'function transferFrom(address from, address to, uint256 tokenId)',
    ];

    const ERC1155_TRANSFER_ABI = [
      'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
    ];

    const abi = tokenType === 'ERC1155' ? ERC1155_TRANSFER_ABI : ERC721_TRANSFER_ABI;
    const contract = new ethers.Contract(contractAddress, abi, wallet);

    let tx;
    if (tokenType === 'ERC1155') {
      tx = await contract.safeTransferFrom(
        wallet.address,
        toAddress,
        tokenId,
        1,
        '0x'
      );
    } else {
      tx = await contract.transferFrom(
        wallet.address,
        toAddress,
        tokenId
      );
    }

    console.log('[sendNFT] Transaction sent:', tx.hash);
    return tx.hash;
  } catch (error) {
    console.error('[sendNFT] Error:', error);
    throw error;
  }
};