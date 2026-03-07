// BNB Smart Chain Token List
// Chain ID: 56

export const bscMetadata = {
  chainId: 56,
  name: "BNB Smart Chain",
  nativeCurrency: {
    name: "BNB",
    symbol: "BNB",
    decimals: 18,
  },
  rpcUrl: "https://bsc-dataseed.binance.org",
  blockExplorerUrl: "https://bscscan.com",
};

export const bscTokens = [
  {
    name: "Wrapped BNB",
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    symbol: "WBNB",
    decimals: 18,
    chainId: 56,
    logoURI:
      "https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/smartchain/assets/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c/logo.png",
  },
  {
    name: "LayerZero",
    address: "0x6985884C4392D348587B19cb9eAAf157F13271cd",
    symbol: "ZRO",
    decimals: 18,
    chainId: 56,
    logoURI:
      "https://assets.coingecko.com/coins/images/28206/standard/ftxG9_TJ_400x400.jpeg?1696527208",
  },
  {
    name: "Kujira",
    address: "0x073690e6CE25bE816E68F32dCA3e11067c9FB5Cc",
    symbol: "KUJI",
    decimals: 6,
    chainId: 56,
    logoURI:
      "https://assets.coingecko.com/coins/images/20685/standard/kuji-200x200.png",
  },
  {
    name: "Aster",
    address: "0x000Ae314E2A2172a039B26378814C252734f556A",
    symbol: "ASTER",
    decimals: 18,
    chainId: 56,
    logoURI:
      "https://coin-images.coingecko.com/coins/images/69040/large/_ASTER.png?1757326782",
  },
];
