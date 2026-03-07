import { useState, useEffect } from "react";
import { useChain } from "../contexts/ChainContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_CONFIG } from "../config/api";

export const useTokenList = () => {
  const { chainId, activeChain } = useChain();
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadTokens = async () => {
      try {
        setLoading(true);
        setError(null);

        // Check cache first
        const cacheKey = `tokens_${chainId}`;
        const cachedData = await AsyncStorage.getItem(cacheKey);

        if (cachedData) {
          const { tokens: cachedTokens, timestamp } = JSON.parse(cachedData);
          const now = Date.now();

          if (now - timestamp < API_CONFIG.CACHE_DURATION) {
            console.log(`✅ Using cached tokens for chain ${chainId}`);
            setTokens(cachedTokens);
            setLoading(false);
            return;
          }
        }

        // Fetch from API
        console.log(`🌐 Fetching tokens from API for chain ${chainId}`);
        const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TOKEN_BY_CHAIN(chainId)}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `API Error: ${response.status} ${response.statusText}`,
          );
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || "Failed to fetch tokens");
        }

        const fetchedTokens = result.data || [];

        // Sort by symbol
        const sortedTokens = fetchedTokens.sort((a, b) =>
          a.symbol.toLowerCase().localeCompare(b.symbol.toLowerCase()),
        );

        setTokens(sortedTokens);

        // Cache the tokens
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({
            tokens: sortedTokens,
            timestamp: Date.now(),
          }),
        );

        console.log(
          `✅ Loaded ${sortedTokens.length} tokens for chain ${chainId}`,
        );
      } catch (err) {
        console.error("Error loading token list:", err);
        setError(err);

        // Fallback to cache
        const cacheKey = `tokens_${chainId}`;
        const cachedData = await AsyncStorage.getItem(cacheKey);
        if (cachedData) {
          const { tokens: cachedTokens } = JSON.parse(cachedData);
          console.warn("⚠️ Using expired cache as fallback");
          setTokens(cachedTokens);
        } else {
          setTokens([]);
        }
      } finally {
        setLoading(false);
      }
    };

    loadTokens();
  }, [chainId]);

  // Helper functions
  const findTokenByAddress = (address) => {
    return tokens.find(
      (token) => token.address.toLowerCase() === address.toLowerCase(),
    );
  };

  const findTokenBySymbol = (symbol) => {
    return tokens.find(
      (token) => token.symbol.toLowerCase() === symbol.toLowerCase(),
    );
  };

  const searchTokens = (query) => {
    const lowerQuery = query.toLowerCase();
    return tokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(lowerQuery) ||
        token.name.toLowerCase().includes(lowerQuery) ||
        token.address.toLowerCase().includes(lowerQuery),
    );
  };

  const refreshTokens = async () => {
    const cacheKey = `tokens_${chainId}`;
    await AsyncStorage.removeItem(cacheKey);
    setTokens([]);
    setLoading(true);
  };

  const clearCache = async () => {
    const keys = await AsyncStorage.getAllKeys();
    const tokenKeys = keys.filter((key) => key.startsWith("tokens_"));
    await AsyncStorage.multiRemove(tokenKeys);
    console.log("🗑️ Token cache cleared");
  };

  return {
    tokens,
    loading,
    error,
    chainId,
    chainName: activeChain.name,
    findTokenByAddress,
    findTokenBySymbol,
    searchTokens,
    refreshTokens,
    clearCache,
  };
};

export default useTokenList;
