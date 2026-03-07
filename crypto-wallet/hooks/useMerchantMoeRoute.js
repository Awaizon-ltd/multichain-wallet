import { useState, useCallback } from "react";
import { ethers } from "ethers";
import {
  encodeSimpleRoute,
  encodeMultiHopRoute,
  isToken0,
} from "../utils/mantle/RouteEncoder.js";
import { fetchSimplifiedRoute } from "../utils/mantle/merchantMoeApi.js";

/**
 * useMerchantMoeRoute Hook
 * Fetches routes from Merchant Moe API and encodes them
 *
 * @param {string} wnativeAddress - WMNT address (for reference)
 * @returns {Object} Route functions and state
 */
export function useMerchantMoeRoute(wnativeAddress) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);

  /**
   * Find and encode a route using Merchant Moe API
   *
   * @param {string} tokenIn - Input token address
   * @param {string} tokenOut - Output token address
   * @param {string} amountIn - Amount in wei (as string)
   * @returns {Promise<Object>} Encoded route and info
   */
  const getRoute = useCallback(
    async (tokenIn, tokenOut, amountIn) => {
      try {
        setLoading(true);
        setError(null);

        // Normalize addresses
        tokenIn = ethers.getAddress(tokenIn);
        tokenOut = ethers.getAddress(tokenOut);

        console.log(
          `[useMerchantMoeRoute] Fetching route from API: ${tokenIn} → ${tokenOut}`,
        );

        // Fetch route from Merchant Moe API
        const routeInfo = await fetchSimplifiedRoute(
          tokenIn,
          tokenOut,
          amountIn,
        );

        console.log("[useMerchantMoeRoute] Route fetched:", {
          tokens: routeInfo.tokens.length,
          swaps: routeInfo.swaps.length,
          simplified: routeInfo.isSimplified,
        });

        // Check if it's a direct swap or multi-hop
        const isDirectSwap = routeInfo.tokens.length === 2;

        let encodedRoute;

        if (isDirectSwap) {
          // Direct swap - simple encoding
          const swap = routeInfo.swaps[0];
          const zeroForOne = isToken0(tokenIn, tokenOut);

          encodedRoute = encodeSimpleRoute(
            tokenIn,
            tokenOut,
            swap.pair,
            swap.dexType,
            zeroForOne,
            false, // isTransferTax - TODO: detect from API
          );
        } else {
          // Multi-hop swap
          const swaps = routeInfo.swaps.map((swap, index) => {
            const currentTokenIn = routeInfo.tokens[index];
            const currentTokenOut = routeInfo.tokens[index + 1];

            return {
              pair: swap.pair,
              dexType: swap.dexType,
              zeroForOne: isToken0(currentTokenIn, currentTokenOut),
              percent: 10000, // 100% - will be adjusted by encoder
            };
          });

          encodedRoute = encodeMultiHopRoute(
            routeInfo.tokens,
            swaps,
            false, // isTransferTax
          );
        }

        const routeData = {
          route: encodedRoute,
          tokens: routeInfo.tokens,
          swaps: routeInfo.swaps,
          isDirectSwap,
          expectedAmountOut: routeInfo.amountOut,
          isSimplified: routeInfo.isSimplified,
        };

        setRouteInfo(routeData);
        return routeData;
      } catch (err) {
        console.error("[useMerchantMoeRoute] Error:", err);
        setError(err.message);
        setRouteInfo(null);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [wnativeAddress],
  );

  /**
   * Clear the current route
   */
  const clearRoute = useCallback(() => {
    setRouteInfo(null);
    setError(null);
  }, []);

  return {
    loading,
    error,
    routeInfo,
    getRoute,
    clearRoute,
  };
}

export default useMerchantMoeRoute;
