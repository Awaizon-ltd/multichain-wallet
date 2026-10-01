// utils/blockchain/nftImage.js
// Single place for "what image do we show for this NFT" — used by every NFT
// screen so the fallback (broken URL, no metadata yet, manually-discovered
// token with no cached image) always resolves to the same local placeholder
// instead of each screen growing its own slightly-different blank state.

export const NFT_PLACEHOLDER_IMAGE = require("../../assets/nft-placeholder.png");

export const getNFTImageUrl = (nft) => {
  if (!nft) return null;
  if (nft.image?.cachedUrl) return nft.image.cachedUrl;
  if (nft.image?.thumbnailUrl) return nft.image.thumbnailUrl;
  if (nft.image?.originalUrl) return nft.image.originalUrl;
  if (nft.media?.[0]?.gateway) return nft.media[0].gateway;
  if (nft.media?.[0]?.thumbnail) return nft.media[0].thumbnail;
  return null;
};
