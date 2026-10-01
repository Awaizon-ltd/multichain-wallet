// utils/blockchain/nftAbi.js
// Minimal ERC-721 / ERC-1155 ABI fragments shared by the manual on-chain
// discovery path (NFTs.js) and NFT import verification — one place instead
// of each call site declaring its own copy.
export const ERC721_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
];

export const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function uri(uint256 id) view returns (string)",
];
