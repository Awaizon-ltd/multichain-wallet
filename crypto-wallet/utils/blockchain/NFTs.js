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
import { ERC721_ABI, ERC1155_ABI } from "./nftAbi";
import * as NftDatabase from "../NftDatabase";

// ============================================================================
// CHAIN SUPPORT CONFIGURATION
// ============================================================================

// Chains Alchemy's NFT API doesn't index yet — these fall back to scanning
// the chain directly (discoverNFTsOnChain below). Add a chain's id here the
// moment it goes live if Alchemy hasn't announced NFT API support for it.
const CHAINS_WITHOUT_NFT_API_SUPPORT = [
  5042, // Arc — too new for Alchemy's NFT API
  4663, // Robinhood Chain — too new for Alchemy's NFT API
  84532, // Base Sepolia — Alchemy doesn't index NFTs on this testnet
  11155111, // Ethereum Sepolia — same
];

// ============================================================================
// MANUAL NFT DISCOVERY (fallback for chains Alchemy doesn't index yet)
// ============================================================================

const ERC721_TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const ERC1155_TRANSFER_SINGLE_TOPIC = ethers.id(
  "TransferSingle(address,address,address,uint256,uint256)",
);
const ERC1155_TRANSFER_BATCH_TOPIC = ethers.id(
  "TransferBatch(address,address,address,uint256[],uint256[])",
);
const ERC1155_TRANSFER_IFACE = new ethers.Interface([
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
]);

const addressToTopic = (address) => ethers.zeroPadValue(address, 32);

// Most public RPCs cap eth_getLogs to a few thousand blocks per call, so the
// scan runs in windows rather than one fromBlock:0 request. These chains are
// only months old (see ARCHITECTURE.md), so a few hundred windows covers
// their entire history without a dedicated indexer.
const LOG_SCAN_CHUNK_BLOCKS = 5000;
const LOG_SCAN_MAX_CHUNKS = 500;

const buildERC721NFT = async (contract, contractAddress, tokenId, chain) => {
  const [tokenURI, collectionName] = await Promise.all([
    contract.tokenURI(tokenId).catch(() => null),
    contract.name().catch(() => "Unknown"),
  ]);
  const metadata = tokenURI ? await fetchNFTMetadata(tokenURI) : null;

  return {
    contract: {
      address: contractAddress,
      name: collectionName,
      tokenType: "ERC721",
    },
    tokenId: tokenId.toString(),
    tokenType: "ERC721",
    title: metadata?.name || `${collectionName} #${tokenId}`,
    description: metadata?.description || "",
    tokenUri: tokenURI ? { raw: tokenURI, gateway: normalizeIPFS(tokenURI) } : null,
    media: metadata?.image
      ? [{ raw: metadata.image, gateway: normalizeIPFS(metadata.image) }]
      : [],
    metadata,
    chainId: chain.id,
    chainName: chain.name,
  };
};

const buildERC1155NFT = async (contract, contractAddress, tokenId, chain) => {
  // Per EIP-1155, {id} in the URI is a 64-char hex token id, zero-padded.
  const [rawUri, collectionName] = await Promise.all([
    contract.uri(tokenId).catch(() => null),
    contract.name?.().catch(() => "Unknown") ?? Promise.resolve("Unknown"),
  ]);
  const tokenURI = rawUri?.includes("{id}")
    ? rawUri.replace("{id}", BigInt(tokenId).toString(16).padStart(64, "0"))
    : rawUri;
  const metadata = tokenURI ? await fetchNFTMetadata(tokenURI) : null;

  return {
    contract: {
      address: contractAddress,
      name: collectionName,
      tokenType: "ERC1155",
    },
    tokenId: tokenId.toString(),
    tokenType: "ERC1155",
    title: metadata?.name || `${collectionName} #${tokenId}`,
    description: metadata?.description || "",
    tokenUri: tokenURI ? { raw: tokenURI, gateway: normalizeIPFS(tokenURI) } : null,
    media: metadata?.image
      ? [{ raw: metadata.image, gateway: normalizeIPFS(metadata.image) }]
      : [],
    metadata,
    chainId: chain.id,
    chainName: chain.name,
  };
};

/**
 * Scan the chain directly for every ERC-721/1155 the address has ever
 * received (via Transfer logs), then confirm *current* ownership with a
 * live ownerOf/balanceOf call — a past incoming transfer doesn't mean the
 * wallet still holds it. This is the fallback for chains too new to have
 * Alchemy (or any indexer) support: it works for any contract, not just a
 * hardcoded allowlist.
 */
const discoverNFTsOnChain = async (ownerAddress, chain) => {
  const provider = createProviderForChain(chain);
  const toTopic = addressToTopic(ownerAddress);
  const latest = await provider.getBlockNumber();

  const erc721Candidates = new Map(); // "contract:tokenId" -> contractAddress
  const erc1155Candidates = new Map();

  let from = 0;
  let chunks = 0;
  while (from <= latest && chunks < LOG_SCAN_MAX_CHUNKS) {
    const to = Math.min(from + LOG_SCAN_CHUNK_BLOCKS - 1, latest);
    chunks += 1;

    const [erc721Logs, singleLogs, batchLogs] = await Promise.all([
      provider
        .getLogs({ fromBlock: from, toBlock: to, topics: [ERC721_TRANSFER_TOPIC, null, toTopic] })
        .catch(() => []),
      provider
        .getLogs({
          fromBlock: from,
          toBlock: to,
          topics: [ERC1155_TRANSFER_SINGLE_TOPIC, null, null, toTopic],
        })
        .catch(() => []),
      provider
        .getLogs({
          fromBlock: from,
          toBlock: to,
          topics: [ERC1155_TRANSFER_BATCH_TOPIC, null, null, toTopic],
        })
        .catch(() => []),
    ]);

    for (const log of erc721Logs) {
      // tokenId is the 3rd indexed topic on ERC-721's Transfer event
      const tokenId = BigInt(log.topics[3]).toString();
      erc721Candidates.set(`${log.address.toLowerCase()}:${tokenId}`, log.address);
    }

    for (const log of [...singleLogs, ...batchLogs]) {
      try {
        const parsed = ERC1155_TRANSFER_IFACE.parseLog(log);
        const ids =
          parsed.name === "TransferSingle"
            ? [parsed.args.id.toString()]
            : parsed.args.ids.map((id) => id.toString());
        for (const id of ids) {
          erc1155Candidates.set(`${log.address.toLowerCase()}:${id}`, log.address);
        }
      } catch {
        // Malformed/unexpected log shape — skip it.
      }
    }

    from = to + 1;
  }

  const nfts = [];

  await Promise.all(
    Array.from(erc721Candidates.entries()).map(async ([key, contractAddress]) => {
      const tokenId = key.split(":")[1];
      try {
        const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
        const currentOwner = await contract.ownerOf(tokenId);
        if (currentOwner.toLowerCase() !== ownerAddress.toLowerCase()) return;
        nfts.push(await buildERC721NFT(contract, contractAddress, tokenId, chain));
      } catch {
        // No longer a live ERC-721 at this address, or ownerOf reverted — skip.
      }
    }),
  );

  await Promise.all(
    Array.from(erc1155Candidates.entries()).map(async ([key, contractAddress]) => {
      const tokenId = key.split(":")[1];
      try {
        const contract = new ethers.Contract(contractAddress, ERC1155_ABI, provider);
        const balance = await contract.balanceOf(ownerAddress, tokenId);
        if (balance <= 0n) return;
        nfts.push(await buildERC1155NFT(contract, contractAddress, tokenId, chain));
      } catch {
        // No longer a live ERC-1155 at this address — skip.
      }
    }),
  );

  return nfts;
};

const getNFTsManually = async (ownerAddress, chain) => {
  try {
    return await discoverNFTsOnChain(ownerAddress, chain);
  } catch (error) {
    console.error("[getNFTsManually] Error:", error);
    return [];
  }
};

/**
 * Verify a wallet owns a specific token and fetch its metadata — used by
 * NFT Import (manually adding an NFT the automatic scan didn't surface,
 * e.g. one received before the app started tracking transfers).
 * Throws with a user-facing message on failure rather than returning null,
 * so the import screen can show *why* it failed.
 */
export const verifyAndFetchNFT = async (
  contractAddress,
  tokenId,
  chain,
  ownerAddress,
) => {
  validateChain(chain, "verifyAndFetchNFT");
  const provider = createProviderForChain(chain);

  // Try ERC-721 first, then ERC-1155 — a contract will only ever answer one.
  try {
    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    const currentOwner = await contract.ownerOf(tokenId);
    if (currentOwner.toLowerCase() !== ownerAddress.toLowerCase()) {
      throw new Error("This wallet doesn't own that token.");
    }
    return await buildERC721NFT(contract, contractAddress, tokenId, chain);
  } catch (erc721Error) {
    if (erc721Error.message?.includes("doesn't own")) throw erc721Error;
    // Fall through to ERC-1155 — ownerOf reverting usually means "wrong ABI", not "no NFT".
  }

  try {
    const contract = new ethers.Contract(contractAddress, ERC1155_ABI, provider);
    const balance = await contract.balanceOf(ownerAddress, tokenId);
    if (balance <= 0n) {
      throw new Error("This wallet doesn't own that token.");
    }
    return await buildERC1155NFT(contract, contractAddress, tokenId, chain);
  } catch (erc1155Error) {
    if (erc1155Error.message?.includes("doesn't own")) throw erc1155Error;
    throw new Error(
      "Couldn't verify this NFT. Check the contract address, token ID, and network.",
    );
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
/**
 * Merge in NFTs the user manually imported (NFT Import screen) that the
 * automatic scan/API didn't surface — deduped against what was already
 * found, by contract + token id.
 */
const mergeImportedNFTs = async (ownerAddress, chain, baseNfts) => {
  try {
    const rows = await NftDatabase.getNftsByChain(ownerAddress, chain.id);
    if (!rows.length) return baseNfts;

    const known = new Set(
      baseNfts.map((n) => `${n.contract?.address?.toLowerCase()}:${n.tokenId}`),
    );
    const imported = rows
      .filter((row) => !known.has(`${row.address.toLowerCase()}:${row.token_id}`))
      .map((row) => ({ ...NftDatabase.nftRowToObject(row), chainName: chain.name }));

    return [...baseNfts, ...imported];
  } catch (error) {
    console.error("[mergeImportedNFTs] Error:", error);
    return baseNfts;
  }
};

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
        const manualNFTs = await mergeImportedNFTs(
          ownerAddress,
          chain,
          await getNFTsManually(ownerAddress, chain),
        );
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
          const manualNFTs = await mergeImportedNFTs(
            ownerAddress,
            chain,
            await getNFTsManually(ownerAddress, chain),
          );
          return {
            nfts: manualNFTs,
            totalCount: manualNFTs.length,
            pageKey: null,
          };
        }
        throw alchemyError;
      }

      const alchemyNfts = nfts.ownedNfts.map((nft) => ({
        ...nft,
        chainId: chain.id,
        chainName: chain.name,
      }));
      const merged = await mergeImportedNFTs(ownerAddress, chain, alchemyNfts);

      return {
        nfts: merged,
        totalCount: merged.length,
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
        const provider = createProviderForChain(chain);
        try {
          const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
          return await buildERC721NFT(contract, contractAddress, tokenId, chain);
        } catch {
          const contract = new ethers.Contract(contractAddress, ERC1155_ABI, provider);
          return await buildERC1155NFT(contract, contractAddress, tokenId, chain);
        }
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
