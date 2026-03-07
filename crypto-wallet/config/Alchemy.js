// config/alchemy.js
export const ALCHEMY_API_KEY = "tlYzVPHTMFIk9YDQyrzrQ";

export const alchemyRpc = (network) =>
  `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
