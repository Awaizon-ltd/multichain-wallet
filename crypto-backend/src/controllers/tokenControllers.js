const tokenParser = require("../utils/tokenParser");
const config = require("../config/config");

// Get all tokens
exports.getAllTokens = (req, res, next) => {
  try {
    const tokens = tokenParser.getAllTokens();
    res.json({
      success: true,
      count: tokens.length,
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
};

// Get tokens by chain ID
exports.getTokensByChain = (req, res, next) => {
  try {
    const { chainId } = req.params;
    const tokens = tokenParser.getTokensByChain(parseInt(chainId));

    if (!tokens || tokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No tokens found for chain ID ${chainId}`,
      });
    }

    res.json({
      success: true,
      chainId: parseInt(chainId),
      chainName: config.chains[chainId] || "unknown",
      count: tokens.length,
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
};

// Get tokens by chain name
exports.getTokensByChainName = (req, res, next) => {
  try {
    const { chainName } = req.params;
    const tokens = tokenParser.getTokensByChainName(chainName);

    if (!tokens || tokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No tokens found for chain ${chainName}`,
      });
    }

    res.json({
      success: true,
      chainName,
      count: tokens.length,
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
};

// Search tokens
exports.searchTokens = (req, res, next) => {
  try {
    const { query, chainId } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Query parameter is required",
      });
    }

    const tokens = tokenParser.searchTokens(
      query,
      chainId ? parseInt(chainId) : null,
    );

    res.json({
      success: true,
      query,
      chainId: chainId ? parseInt(chainId) : "all",
      count: tokens.length,
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
};

// Find token by address
exports.getTokenByAddress = (req, res, next) => {
  try {
    const { chainId, address } = req.params;
    const token = tokenParser.findTokenByAddress(address, parseInt(chainId));

    if (!token) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    res.json({
      success: true,
      data: token,
    });
  } catch (error) {
    next(error);
  }
};

// Find token by symbol
exports.getTokenBySymbol = (req, res, next) => {
  try {
    const { chainId, symbol } = req.params;
    const token = tokenParser.findTokenBySymbol(symbol, parseInt(chainId));

    if (!token) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    res.json({
      success: true,
      data: token,
    });
  } catch (error) {
    next(error);
  }
};

// Get available chains
exports.getChains = (req, res, next) => {
  try {
    const chains = Object.entries(config.chains).map(([id, name]) => ({
      chainId: parseInt(id),
      name,
      tokensCount: tokenParser.getTokensByChain(parseInt(id)).length,
    }));

    res.json({
      success: true,
      count: chains.length,
      data: chains,
    });
  } catch (error) {
    next(error);
  }
};

// Reload token lists
exports.reloadTokens = (req, res, next) => {
  try {
    tokenParser.reload();
    res.json({
      success: true,
      message: "Token lists reloaded successfully",
    });
  } catch (error) {
    next(error);
  }
};
