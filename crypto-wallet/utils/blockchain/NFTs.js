// utils/nfts.js
import { ethers } from "ethers";
import {
  createWalletForChain,
  validateChain,
  createProviderForChain,
} from "./Providers";
import { getAlchemyInstance, ALCHEMY_NETWORK_MAP } from "./Alchemy";
import { SUPPORTED_CHAINS } from "../../constants/Chain";
import { withCache, nftCache } from "./NftsCache";

// ============================================================================
// CHAIN SUPPORT CONFIGURATION
// ============================================================================

// Chains that don't support Alchemy NFT APIs
const CHAINS_WITHOUT_NFT_API_SUPPORT = [
  5000, // Mantle Mainnet
  5001, // Mantle Testnet
  // Add other unsupported chains as needed
];

// Popular NFT contract addresses for manual fetching
const KNOWN_NFT_COLLECTIONS = {
  5000: [
    // Mantle Mainnet - Add known collections here
    {
      address: "0x...", // Example NFT collection
      name: "Mantle NFTs",
      symbol: "MNFT",
      type: "ERC721",
    },
  ],
  5001: [
    // Mantle Testnet
  ],
  // Add other chains here
};

// ============================================================================
// MANUAL NFT FETCHING (Fallback for unsupported chains)
// ============================================================================

/**
 * Manually fetch NFTs using direct contract calls
 */
const getNFTsManually = async (ownerAddress, chain) => {
  try {
    const provider = createProviderForChain(chain);
    const knownCollections = KNOWN_NFT_COLLECTIONS[chain.id] || [];

    if (knownCollections.length === 0) {
      console.warn(
        `[getNFTsManually] No known NFT collections configured for chain ${chain.name} (${chain.id})`,
      );

      // Try using chain explorer API if available
      const explorerNFTs = await fetchNFTsFromExplorer(ownerAddress, chain);
      if (explorerNFTs.length > 0) {
        return explorerNFTs;
      }

      return [];
    }

    const ERC721_ABI = [
      "function balanceOf(address owner) view returns (uint256)",
      "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
      "function tokenURI(uint256 tokenId) view returns (string)",
      "function name() view returns (string)",
      "function symbol() view returns (string)",
    ];

    const ERC1155_ABI = [
      "function balanceOf(address account, uint256 id) view returns (uint256)",
      "function uri(uint256 id) view returns (string)",
    ];

    const nftPromises = knownCollections.map(async (collection) => {
      try {
        const isERC1155 = collection.type === "ERC1155";
        const abi = isERC1155 ? ERC1155_ABI : ERC721_ABI;
        const contract = new ethers.Contract(collection.address, abi, provider);

        if (isERC1155) {
          // ERC1155: Need to know token IDs beforehand (limitation of manual method)
          return [];
        } else {
          // ERC721: Get all tokens owned
          const balance = await contract.balanceOf(ownerAddress);
          const balanceNum = Number(balance);

          if (balanceNum === 0) {
            return [];
          }

          const tokenIds = await Promise.all(
            Array.from({ length: balanceNum }, (_, i) =>
              contract.tokenOfOwnerByIndex(ownerAddress, i),
            ),
          );

          const nfts = await Promise.all(
            tokenIds.map(async (tokenId) => {
              try {
                const tokenURI = await contract.tokenURI(tokenId);
                const metadata = await fetchNFTMetadata(tokenURI);

                return {
                  contract: {
                    address: collection.address,
                    name: collection.name,
                    symbol: collection.symbol,
                    tokenType: "ERC721",
                  },
                  tokenId: tokenId.toString(),
                  tokenType: "ERC721",
                  title: metadata?.name || `${collection.name} #${tokenId}`,
                  description: metadata?.description || "",
                  tokenUri: {
                    raw: tokenURI,
                    gateway: tokenURI,
                  },
                  media: metadata?.image
                    ? [
                        {
                          raw: metadata.image,
                          gateway: normalizeIPFS(metadata.image),
                        },
                      ]
                    : [],
                  metadata: metadata,
                  chainId: chain.id,
                  chainName: chain.name,
                };
              } catch (err) {
                console.error(
                  `[getNFTsManually] Error fetching token ${tokenId}:`,
                  err,
                );
                return null;
              }
            }),
          );

          return nfts.filter((nft) => nft !== null);
        }
      } catch (err) {
        console.error(
          `[getNFTsManually] Error fetching collection ${collection.address}:`,
          err,
        );
        return [];
      }
    });

    const results = await Promise.all(nftPromises);
    return results.flat();
  } catch (error) {
    console.error("[getNFTsManually] Error:", error);
    return [];
  }
};

/**
 * Fetch NFTs from blockchain explorer API (e.g., Etherscan-like APIs)
 */
const fetchNFTsFromExplorer = async (ownerAddress, chain) => {
  try {
    // Mantle Explorer API
    if (chain.id === 5000) {
      const response = await fetch(
        `https://explorer.mantle.xyz/api?module=account&action=tokennfttx&address=${ownerAddress}&startblock=0&endblock=99999999&sort=desc`,
      );
      const data = await response.json();

      if (data.status === "1" && data.result?.length > 0) {
        // Group by contract and tokenID to get unique NFTs
        const uniqueNFTs = new Map();

        data.result.forEach((tx) => {
          const key = `${tx.contractAddress}-${tx.tokenID}`;
          if (
            !uniqueNFTs.has(key) &&
            tx.to.toLowerCase() === ownerAddress.toLowerCase()
          ) {
            uniqueNFTs.set(key, {
              contract: {
                address: tx.contractAddress,
                name: tx.tokenName || "Unknown",
                symbol: tx.tokenSymbol || "???",
                tokenType: tx.tokenID ? "ERC721" : "ERC1155",
              },
              tokenId: tx.tokenID,
              tokenType: tx.tokenID ? "ERC721" : "ERC1155",
              title: `${tx.tokenName || "NFT"} #${tx.tokenID}`,
              description: "",
              chainId: chain.id,
              chainName: chain.name,
            });
          }
        });

        return Array.from(uniqueNFTs.values());
      }
    }

    return [];
  } catch (error) {
    console.error("[fetchNFTsFromExplorer] Error:", error);
    return [];
  }
};

/**
 * Fetch and parse NFT metadata from tokenURI
 */
const fetchNFTMetadata = async (tokenURI) => {
  try {
    const normalizedURI = normalizeIPFS(tokenURI);

    // Handle data URIs
    if (normalizedURI.startsWith("data:application/json")) {
      const base64Data = normalizedURI.split(",")[1];
      const jsonString = atob(base64Data);
      return JSON.parse(jsonString);
    }

    // Fetch from HTTP/IPFS
    const response = await fetch(normalizedURI, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("[fetchNFTMetadata] Error:", error);
    return null;
  }
};

/**
 * Normalize IPFS URLs to use public gateways
 */
const normalizeIPFS = (url) => {
  if (!url) return "";

  // Handle ipfs:// protocol
  if (url.startsWith("ipfs://")) {
    return url.replace("ipfs://", "https://ipfs.io/ipfs/");
  }

  // Handle /ipfs/ paths
  if (url.startsWith("/ipfs/")) {
    return `https://ipfs.io${url}`;
  }

  return url;
};

// ============================================================================
// MAIN NFT FUNCTIONS (with fallback support)
// ============================================================================

/**
 * Get all NFTs owned by an address on a specific chain
 * CACHED for 5 minutes
 */
export const getNFTsForOwner = async (ownerAddress, chain, options = {}) => {
  const cacheKey = nftCache.generateKey(
    "getNFTsForOwner",
    ownerAddress,
    chain.id,
    options,
  );

  return withCache(cacheKey, async () => {
    try {
      validateChain(chain, "getNFTsForOwner");

      // Check if chain supports Alchemy NFT API
      const supportsNFTAPI = !CHAINS_WITHOUT_NFT_API_SUPPORT.includes(chain.id);

      if (!supportsNFTAPI) {
        console.log(
          `[getNFTsForOwner] Chain ${chain.name} (${chain.id}) doesn't support Alchemy NFT API, using manual method...`,
        );
        const manualNFTs = await getNFTsManually(ownerAddress, chain);
        return {
          nfts: manualNFTs,
          totalCount: manualNFTs.length,
          pageKey: null,
        };
      }

      // Use Alchemy NFT API for supported chains
      const alchemy = getAlchemyInstance(chain.id);

      let nfts;
      try {
        nfts = await alchemy.nft.getNftsForOwner(ownerAddress, {
          excludeFilters: options.excludeSpam ? ["SPAM"] : [],
          pageSize: options.pageSize || 100,
          ...options,
        });
      } catch (alchemyError) {
        // Fallback if API is not available
        if (
          alchemyError.message?.includes("not enabled") ||
          alchemyError.message?.includes("not supported")
        ) {
          console.warn(
            `[getNFTsForOwner] NFT API not available for ${chain.name}, falling back to manual method...`,
          );
          const manualNFTs = await getNFTsManually(ownerAddress, chain);
          return {
            nfts: manualNFTs,
            totalCount: manualNFTs.length,
            pageKey: null,
          };
        }
        throw alchemyError;
      }

      return {
        nfts: nfts.ownedNfts.map((nft) => ({
          ...nft,
          chainId: chain.id,
          chainName: chain.name,
        })),
        totalCount: nfts.totalCount,
        pageKey: nfts.pageKey,
      };
    } catch (error) {
      console.error("[getNFTsForOwner] Error:", error);
      throw error;
    }
  });
};

/**
 * Get all NFTs owned by an address across ALL supported chains
 * CACHED for 5 minutes - This is a BIG saver!
 */
export const getAllNFTsAcrossChains = async (ownerAddress, options = {}) => {
  const cacheKey = nftCache.generateKey(
    "getAllNFTsAcrossChains",
    ownerAddress,
    options,
  );

  return withCache(cacheKey, async () => {
    try {
      console.log("[getAllNFTsAcrossChains] Fetching NFTs for:", ownerAddress);

      // Get ALL supported chains (not just Alchemy-supported ones)
      const allChains = Object.values(SUPPORTED_CHAINS);

      console.log(
        "[getAllNFTsAcrossChains] Checking chains:",
        allChains.map((c) => c.name),
      );

      const nftPromises = allChains.map(async (chain) => {
        try {
          console.log(
            `[getAllNFTsAcrossChains] Fetching from ${chain.name}...`,
          );

          const result = await getNFTsForOwner(ownerAddress, chain, options);

          console.log(
            `[getAllNFTsAcrossChains] ${chain.name}: Found ${result.totalCount} NFTs`,
          );

          return {
            chain: {
              id: chain.id,
              name: chain.name,
              symbol: chain.symbol,
              icon: chain.icon,
              explorer: chain.explorer,
            },
            nfts: result.nfts,
            totalCount: result.totalCount,
            pageKey: result.pageKey,
          };
        } catch (error) {
          console.error(
            `[getAllNFTsAcrossChains] Error fetching from ${chain.name}:`,
            error,
          );
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
      const allNFTs = results.flatMap((result) => result.nfts);
      const totalCount = results.reduce(
        (sum, result) => sum + result.totalCount,
        0,
      );

      console.log(
        "[getAllNFTsAcrossChains] Total NFTs across all chains:",
        totalCount,
      );

      return {
        nfts: allNFTs,
        totalCount,
        byChain: results,
        chains: allChains.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
        })),
      };
    } catch (error) {
      console.error("[getAllNFTsAcrossChains] Fatal error:", error);
      throw error;
    }
  });
};

/**
 * Get NFTs with pagination across all chains
 * CACHED for 5 minutes
 */
export const getAllNFTsAcrossChainsWithPagination = async (
  ownerAddress,
  pageSize = 10,
) => {
  const cacheKey = nftCache.generateKey(
    "getAllNFTsAcrossChainsWithPagination",
    ownerAddress,
    pageSize,
  );

  return withCache(cacheKey, async () => {
    try {
      console.log(
        "[getAllNFTsAcrossChainsWithPagination] Fetching NFTs for:",
        ownerAddress,
      );

      const allChains = Object.values(SUPPORTED_CHAINS);

      const nftPromises = allChains.map(async (chain) => {
        try {
          const result = await getNFTsForOwner(ownerAddress, chain, {
            excludeSpam: true,
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
            nfts: result.nfts,
            totalCount: result.totalCount,
            pageKey: result.pageKey,
          };
        } catch (error) {
          console.error(
            `[getAllNFTsAcrossChainsWithPagination] Error for ${chain.name}:`,
            error,
          );
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
      const allNFTs = results.flatMap((result) => result.nfts);
      const totalCount = results.reduce(
        (sum, result) => sum + result.totalCount,
        0,
      );

      return {
        nfts: allNFTs,
        totalCount,
        byChain: results,
        hasMore: results.some((result) => result.pageKey),
      };
    } catch (error) {
      console.error("[getAllNFTsAcrossChainsWithPagination] Error:", error);
      throw error;
    }
  });
};

/**
 * Get NFT metadata
 * CACHED for 5 minutes
 */
export const getNFTMetadata = async (contractAddress, tokenId, chain) => {
  const cacheKey = nftCache.generateKey(
    "getNFTMetadata",
    contractAddress,
    tokenId,
    chain.id,
  );

  return withCache(cacheKey, async () => {
    try {
      validateChain(chain, "getNFTMetadata");

      const supportsNFTAPI = !CHAINS_WITHOUT_NFT_API_SUPPORT.includes(chain.id);

      if (!supportsNFTAPI) {
        // Manual metadata fetch
        const provider = createProviderForChain(chain);
        const ERC721_ABI = [
          "function tokenURI(uint256 tokenId) view returns (string)",
        ];
        const contract = new ethers.Contract(
          contractAddress,
          ERC721_ABI,
          provider,
        );

        const tokenURI = await contract.tokenURI(tokenId);
        const metadata = await fetchNFTMetadata(tokenURI);

        return {
          contract: { address: contractAddress },
          tokenId: tokenId.toString(),
          tokenType: "ERC721",
          title: metadata?.name || `Token #${tokenId}`,
          description: metadata?.description || "",
          tokenUri: { raw: tokenURI, gateway: normalizeIPFS(tokenURI) },
          media: metadata?.image
            ? [{ raw: metadata.image, gateway: normalizeIPFS(metadata.image) }]
            : [],
          metadata,
        };
      }

      const alchemy = getAlchemyInstance(chain.id);
      const metadata = await alchemy.nft.getNftMetadata(
        contractAddress,
        tokenId,
      );

      return metadata;
    } catch (error) {
      console.error("[getNFTMetadata] Error:", error);
      throw error;
    }
  });
};

// ... (keep all other existing functions: getNFTContractMetadata, getNFTFloorPrice, etc.)
// They will automatically use fallback when needed through getNFTsForOwner

/**
 * Get NFT contract metadata
 * CACHED for 5 minutes
 */
export const getNFTContractMetadata = async (contractAddress, chain) => {
  const cacheKey = nftCache.generateKey(
    "getNFTContractMetadata",
    contractAddress,
    chain.id,
  );

  return withCache(cacheKey, async () => {
    try {
      validateChain(chain, "getNFTContractMetadata");

      const alchemy = getAlchemyInstance(chain.id);
      const metadata = await alchemy.nft.getContractMetadata(contractAddress);

      return metadata;
    } catch (error) {
      console.error("[getNFTContractMetadata] Error:", error);
      throw error;
    }
  });
};

/**
 * Get NFT floor price
 * CACHED for 5 minutes
 */
export const getNFTFloorPrice = async (contractAddress, chain) => {
  const cacheKey = nftCache.generateKey(
    "getNFTFloorPrice",
    contractAddress,
    chain.id,
  );

  return withCache(cacheKey, async () => {
    try {
      validateChain(chain, "getNFTFloorPrice");

      const alchemy = getAlchemyInstance(chain.id);
      const floorPrice = await alchemy.nft.getFloorPrice(contractAddress);

      return floorPrice;
    } catch (error) {
      console.error("[getNFTFloorPrice] Error:", error);
      throw error;
    }
  });
};

/**
 * Check if contract is spam
 * CACHED for 5 minutes
 */
export const isSpamContract = async (contractAddress, chain) => {
  const cacheKey = nftCache.generateKey(
    "isSpamContract",
    contractAddress,
    chain.id,
  );

  return withCache(cacheKey, async () => {
    try {
      validateChain(chain, "isSpamContract");

      const alchemy = getAlchemyInstance(chain.id);
      const isSpam = await alchemy.nft.isSpamContract(contractAddress);

      return isSpam;
    } catch (error) {
      console.error("[isSpamContract] Error:", error);
      return false;
    }
  });
};

/**
 * Refresh NFT metadata
 * NOT CACHED - This is an action that should always execute
 */
export const refreshNFTMetadata = async (contractAddress, tokenId, chain) => {
  try {
    validateChain(chain, "refreshNFTMetadata");

    const alchemy = getAlchemyInstance(chain.id);
    const result = await alchemy.nft.refreshNftMetadata(
      contractAddress,
      tokenId,
    );

    // Invalidate related caches after refresh
    const metadataKey = nftCache.generateKey(
      "getNFTMetadata",
      contractAddress,
      tokenId,
      chain.id,
    );
    nftCache.cache.delete(metadataKey);

    return result;
  } catch (error) {
    console.error("[refreshNFTMetadata] Error:", error);
    throw error;
  }
};

/**
 * Send NFT (ERC-721 or ERC-1155)
 * NOT CACHED - This is a transaction that should always execute
 */
export const sendNFT = async (
  privateKey,
  contractAddress,
  toAddress,
  tokenId,
  tokenType = "ERC721",
  chain,
) => {
  try {
    validateChain(chain, "sendNFT");

    const wallet = createWalletForChain(chain, privateKey);

    const ERC721_TRANSFER_ABI = [
      "function transferFrom(address from, address to, uint256 tokenId)",
    ];

    const ERC1155_TRANSFER_ABI = [
      "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
    ];

    const abi =
      tokenType === "ERC1155" ? ERC1155_TRANSFER_ABI : ERC721_TRANSFER_ABI;
    const contract = new ethers.Contract(contractAddress, abi, wallet);

    let tx;
    if (tokenType === "ERC1155") {
      tx = await contract.safeTransferFrom(
        wallet.address,
        toAddress,
        tokenId,
        1,
        "0x",
      );
    } else {
      tx = await contract.transferFrom(wallet.address, toAddress, tokenId);
    }

    console.log("[sendNFT] Transaction sent:", tx.hash);

    // Invalidate owner caches after transfer
    nftCache.clear(); // Clear all NFT ownership caches since ownership changed

    return tx.hash;
  } catch (error) {
    console.error("[sendNFT] Error:", error);
    throw error;
  }
};

/**
 * Get NFTs for a specific collection
 * CACHED for 5 minutes
 */
export const getNFTsForCollection = async (
  contractAddress,
  chain,
  options = {},
) => {
  const cacheKey = nftCache.generateKey(
    "getNFTsForCollection",
    contractAddress,
    chain.id,
    options,
  );

  return withCache(cacheKey, async () => {
    try {
      validateChain(chain, "getNFTsForCollection");

      const alchemy = getAlchemyInstance(chain.id);
      const nfts = await alchemy.nft.getNftsForContract(contractAddress, {
        pageSize: options.pageSize || 100,
        ...options,
      });

      return nfts;
    } catch (error) {
      console.error("[getNFTsForCollection] Error:", error);
      throw error;
    }
  });
};

/**
 * Get owners of an NFT
 * CACHED for 5 minutes
 */
export const getNFTOwners = async (contractAddress, tokenId, chain) => {
  const cacheKey = nftCache.generateKey(
    "getNFTOwners",
    contractAddress,
    tokenId,
    chain.id,
  );

  return withCache(cacheKey, async () => {
    try {
      validateChain(chain, "getNFTOwners");

      const alchemy = getAlchemyInstance(chain.id);
      const owners = await alchemy.nft.getOwnersForNft(
        contractAddress,
        tokenId,
      );

      return owners;
    } catch (error) {
      console.error("[getNFTOwners] Error:", error);
      throw error;
    }
  });
};

/**
 * Verify NFT ownership
 * CACHED for 5 minutes
 */
export const verifyNFTOwnership = async (
  ownerAddress,
  contractAddress,
  chain,
) => {
  const cacheKey = nftCache.generateKey(
    "verifyNFTOwnership",
    ownerAddress,
    contractAddress,
    chain.id,
  );

  return withCache(cacheKey, async () => {
    try {
      validateChain(chain, "verifyNFTOwnership");

      const alchemy = getAlchemyInstance(chain.id);
      const result = await alchemy.nft.verifyNftOwnership(
        ownerAddress,
        contractAddress,
      );

      return result;
    } catch (error) {
      console.error("[verifyNFTOwnership] Error:", error);
      return false;
    }
  });
};

/**
 * Utility: Clear all NFT caches manually
 */
export const clearNFTCache = () => {
  nftCache.clear();
};

/**
 * Utility: Get cache statistics
 */
export const getNFTCacheStats = () => {
  return nftCache.getStats();
};
