// utils/NftDatabase.js
/**
 * NFT database helpers — chain-scoped queries for manually-imported NFTs.
 * Mirrors TokenDatabase.js: user_id is a wallet address string, and every
 * query waits for the DB to be ready and fails soft (safe empty default)
 * rather than throwing into a screen's render.
 */

import { getDatabase } from "./Database";
import { waitForDatabase } from "./DatabaseReady";

const getReadyDb = async () => {
  const result = await waitForDatabase();

  if (result?.timedOut) {
    console.warn("[NftDB] ⚠️  DB timed out — proceeding with best-effort query");
  }

  const db = getDatabase();
  if (!db) {
    throw new Error(
      "[NftDB] getDatabase() is null. " +
        "Ensure initDatabase() is awaited before rendering wallet screens.",
    );
  }
  return db;
};

export const getNftsByChain = async (userAddress, chainId) => {
  try {
    const db = await getReadyDb();
    return await db.getAllAsync(
      "SELECT * FROM nfts WHERE LOWER(user_id) = ? AND chain_id = ? ORDER BY created_at DESC",
      [userAddress.toLowerCase(), parseInt(chainId)],
    );
  } catch (error) {
    console.error("[NftDB] ❌ getNftsByChain:", error);
    return [];
  }
};

export const getAllNfts = async (userAddress) => {
  try {
    const db = await getReadyDb();
    return await db.getAllAsync(
      "SELECT * FROM nfts WHERE LOWER(user_id) = ? ORDER BY chain_id, created_at DESC",
      [userAddress.toLowerCase()],
    );
  } catch (error) {
    console.error("[NftDB] ❌ getAllNfts:", error);
    return [];
  }
};

export const nftExists = async (userAddress, chainId, address, tokenId) => {
  try {
    const db = await getReadyDb();
    const result = await db.getFirstAsync(
      "SELECT COUNT(*) as count FROM nfts WHERE LOWER(user_id) = ? AND chain_id = ? AND LOWER(address) = ? AND token_id = ?",
      [userAddress.toLowerCase(), parseInt(chainId), address.toLowerCase(), String(tokenId)],
    );
    return (result?.count ?? 0) > 0;
  } catch (error) {
    console.error("[NftDB] ❌ nftExists:", error);
    return false;
  }
};

export const saveNft = async (userAddress, chainId, nftData) => {
  try {
    const db = await getReadyDb();
    const result = await db.runAsync(
      "INSERT OR REPLACE INTO nfts (user_id, chain_id, address, token_id, token_type, name, image) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        userAddress.toLowerCase(),
        parseInt(chainId),
        nftData.address.toLowerCase(),
        String(nftData.tokenId),
        nftData.tokenType,
        nftData.name || null,
        nftData.image || null,
      ],
    );
    return result.lastInsertRowId;
  } catch (error) {
    console.error("[NftDB] ❌ saveNft:", error);
    throw error;
  }
};

export const deleteNft = async (userAddress, chainId, address, tokenId) => {
  try {
    const db = await getReadyDb();
    await db.runAsync(
      "DELETE FROM nfts WHERE LOWER(user_id) = ? AND chain_id = ? AND LOWER(address) = ? AND token_id = ?",
      [userAddress.toLowerCase(), parseInt(chainId), address.toLowerCase(), String(tokenId)],
    );
  } catch (error) {
    console.error("[NftDB] ❌ deleteNft:", error);
    throw error;
  }
};

/** Convert a stored row into the same NFT object shape the rest of the app reads. */
export const nftRowToObject = (row) => ({
  contract: { address: row.address, name: row.name, tokenType: row.token_type },
  tokenId: row.token_id,
  tokenType: row.token_type,
  title: row.name || `Token #${row.token_id}`,
  description: "",
  media: row.image ? [{ raw: row.image, gateway: row.image }] : [],
  metadata: null,
  chainId: row.chain_id,
  imported: true,
});

export default {
  getNftsByChain,
  getAllNfts,
  nftExists,
  saveNft,
  deleteNft,
  nftRowToObject,
};
