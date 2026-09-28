import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CHAIN, SUPPORTED_CHAINS, getChainById } from '../constants/Chain';
import { APP_CONFIG } from '../constants/Config';

const ENABLED_NETWORKS_KEY = '@enabled_networks';
const ChainContext = createContext();

export const useChain = () => {
  const context = useContext(ChainContext);
  if (!context) throw new Error('useChain must be used within a ChainProvider');
  return context;
};

export const ChainProvider = ({ children }) => {
  const [activeChain, setActiveChain] = useState(DEFAULT_CHAIN);
  const [loading, setLoading] = useState(true);
  const [enabledChainIds, setEnabledChainIds] = useState(null); // null = still loading

  const allChains = useMemo(
    () => Object.values(SUPPORTED_CHAINS),
    [],
  );

  const availableChains = useMemo(
    () => (__DEV__ ? allChains : allChains.filter(c => !c.testnet)),
    [allChains],
  );

  const mainnetChains = useMemo(
    () => allChains.filter(c => !c.testnet),
    [allChains],
  );

  const getSafeDefaultChain = useCallback(() => {
    if (__DEV__) return DEFAULT_CHAIN;
    if (DEFAULT_CHAIN.testnet) return mainnetChains[0] || DEFAULT_CHAIN;
    return DEFAULT_CHAIN;
  }, [mainnetChains]);

  // Load both active chain and enabled networks in one shot
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [savedChainId, savedNetworks] = await Promise.all([
          AsyncStorage.getItem(APP_CONFIG.STORAGE_KEYS.SELECTED_CHAIN),
          AsyncStorage.getItem(ENABLED_NETWORKS_KEY),
        ]);

        // Resolve active chain (used by dApp browser / signing)
        if (savedChainId) {
          const chain = getChainById(parseInt(savedChainId));
          if (chain && (__DEV__ || !chain.testnet)) {
            setActiveChain(chain);
          } else {
            setActiveChain(getSafeDefaultChain());
          }
        } else {
          setActiveChain(getSafeDefaultChain());
        }

        // Resolve enabled network set (used by portfolio)
        if (savedNetworks) {
          const arr = JSON.parse(savedNetworks);
          setEnabledChainIds(new Set(arr));
        } else {
          // Default: all mainnet EVM chains enabled
          setEnabledChainIds(new Set(mainnetChains.map(c => c.id)));
        }
      } catch (err) {
        console.error('[ChainContext] Error loading state:', err);
        setActiveChain(getSafeDefaultChain());
        setEnabledChainIds(new Set(mainnetChains.map(c => c.id)));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Active chain (dApp browser / signing) ────────────────────────────────────

  const switchChain = useCallback(async (chain) => {
    const validChain = getChainById(chain.id);
    if (!validChain) throw new Error(`Chain ${chain.name} (${chain.id}) is not supported`);
    if (!__DEV__ && validChain.testnet) throw new Error('Testnet chains are not available in production');
    await AsyncStorage.setItem(APP_CONFIG.STORAGE_KEYS.SELECTED_CHAIN, chain.id.toString());
    setActiveChain(chain);
    return true;
  }, []);

  const switchChainById = useCallback(async (chainId) => {
    const chain = getChainById(chainId);
    if (!chain) throw new Error(`Chain with ID ${chainId} not found`);
    if (!__DEV__ && chain.testnet) throw new Error('Testnet chains are not available in production');
    return switchChain(chain);
  }, [switchChain]);

  const resetToDefault = useCallback(async () => {
    return switchChain(getSafeDefaultChain());
  }, [switchChain, getSafeDefaultChain]);

  // ── Enabled networks (portfolio display) ─────────────────────────────────────

  const toggleNetwork = useCallback(async (chainId) => {
    setEnabledChainIds(prev => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(chainId)) {
        if (next.size <= 1) return prev; // always keep at least one
        next.delete(chainId);
      } else {
        next.add(chainId);
      }
      // Persist fire-and-forget
      AsyncStorage.setItem(ENABLED_NETWORKS_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }, []);

  const isNetworkEnabled = useCallback((chainId) => {
    if (!enabledChainIds) return true; // loading → show all
    return enabledChainIds.has(chainId);
  }, [enabledChainIds]);

  const getEnabledChains = useCallback(() => {
    if (!enabledChainIds) return availableChains;
    return availableChains.filter(c => enabledChainIds.has(c.id));
  }, [enabledChainIds, availableChains]);

  // ── Utilities ─────────────────────────────────────────────────────────────────

  const getChain = useCallback((chainId) => getChainById(chainId), []);

  const isChainSupported = useCallback((chainId) => {
    const chain = getChainById(chainId);
    if (!chain) return false;
    if (!__DEV__ && chain.testnet) return false;
    return true;
  }, []);

  const getAllChains = useCallback(() => availableChains, [availableChains]);
  const getMainnetChains = useCallback(() => mainnetChains, [mainnetChains]);
  const getTestnetChains = useCallback(
    () => (__DEV__ ? allChains.filter(c => c.testnet) : []),
    [allChains],
  );

  const value = {
    // State
    activeChain,
    loading,
    chains: availableChains, // flat array — used by dApp browser and pickers

    // Active chain shortcuts
    chainId: activeChain.id,
    chainName: activeChain.name,
    chainSymbol: activeChain.symbol,
    chainExplorer: activeChain.explorer,
    chainIcon: activeChain.icon,
    isTestnet: activeChain.testnet,

    // Environment
    isProduction: !__DEV__,
    isDevelopment: __DEV__,

    // Chain switching (dApp browser / signing)
    switchChain,
    switchChainById,
    resetToDefault,

    // Network enable / disable (portfolio)
    enabledChainIds,
    toggleNetwork,
    isNetworkEnabled,
    getEnabledChains,

    // Utilities
    getChain,
    isChainSupported,
    getAllChains,
    getMainnetChains,
    getTestnetChains,
    getAvailableChains: getAllChains,
  };

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
};

export default ChainContext;
