import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useMemo,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_CHAIN,
  DEFAULT_NETWORK_IDS,
  SUPPORTED_CHAINS,
  getChainById,
} from "../constants/Chain";
import { APP_CONFIG } from "../constants/Config";
import { NON_EVM_CHAINS } from "../constants/nonEvmChain"; // adjust path to match your project

const ENABLED_NETWORKS_KEY = "@enabled_networks";
// Set once the user's enabled-networks list has been through the Solana rollout,
// so a user who later turns Solana off doesn't get it switched back on.
const SOLANA_INTRODUCED_KEY = "@solana_network_introduced";
const ChainContext = createContext();

// Non-EVM chains have a `key` ("SOLANA") instead of a numeric `id`.
// Normalize so `id` works everywhere (enabled-networks Set, pickers, lookups).
const NON_EVM_LIST = Object.values(NON_EVM_CHAINS).map((c) => ({
  ...c,
  id: c.id ?? c.key,
}));
const SOLANA_CHAIN = NON_EVM_LIST.find((c) => c.type === "solana") || null;

// Default networks first (in DEFAULT_NETWORK_IDS order), then the rest as-is
const byDefaultOrder = (a, b) => {
  const rank = (c) => {
    const i = DEFAULT_NETWORK_IDS.indexOf(c.id);
    return i === -1 ? DEFAULT_NETWORK_IDS.length : i;
  };
  return rank(a) - rank(b);
};

export const isSolanaChain = (chain) => chain?.type === "solana";
export const isEvmChain = (chain) =>
  !!chain && (!chain.type || chain.type === "evm");

export const useChain = () => {
  const context = useContext(ChainContext);
  if (!context) throw new Error("useChain must be used within a ChainProvider");
  return context;
};

export const ChainProvider = ({ children }) => {
  const [activeChain, setActiveChain] = useState(DEFAULT_CHAIN);
  const [loading, setLoading] = useState(true);
  const [enabledChainIds, setEnabledChainIds] = useState(null); // null = still loading

  // EVM chains only: these drive the dApp browser / signing
  const allChains = useMemo(() => Object.values(SUPPORTED_CHAINS), []);

  const availableChains = useMemo(
    () => (__DEV__ ? allChains : allChains.filter((c) => !c.testnet)),
    [allChains],
  );

  const mainnetChains = useMemo(
    () => allChains.filter((c) => !c.testnet),
    [allChains],
  );

  // EVM + non-EVM: these drive the portfolio and network toggles
  const availableNetworks = useMemo(
    () =>
      [
        ...availableChains,
        ...(__DEV__ ? NON_EVM_LIST : NON_EVM_LIST.filter((c) => !c.testnet)),
      ].sort(byDefaultOrder),
    [availableChains],
  );

  const mainnetNetworks = useMemo(
    () =>
      [...mainnetChains, ...NON_EVM_LIST.filter((c) => !c.testnet)].sort(
        byDefaultOrder,
      ),
    [mainnetChains],
  );

  // What a brand-new wallet starts with enabled: the default networks
  const defaultEnabledIds = useMemo(
    () =>
      new Set(
        mainnetNetworks
          .filter((c) => DEFAULT_NETWORK_IDS.includes(c.id))
          .map((c) => c.id),
      ),
    [mainnetNetworks],
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
        const [savedChainId, savedNetworks, solanaIntroduced] =
          await Promise.all([
            AsyncStorage.getItem(APP_CONFIG.STORAGE_KEYS.SELECTED_CHAIN),
            AsyncStorage.getItem(ENABLED_NETWORKS_KEY),
            AsyncStorage.getItem(SOLANA_INTRODUCED_KEY),
          ]);

        // Resolve active chain (used by dApp browser / signing, always EVM)
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
          const ids = new Set(JSON.parse(savedNetworks));

          // One-time rollout: existing users get Solana switched on once.
          // After that, their own toggle choice sticks.
          if (SOLANA_CHAIN && !solanaIntroduced) {
            ids.add(SOLANA_CHAIN.id);
            AsyncStorage.multiSet([
              [ENABLED_NETWORKS_KEY, JSON.stringify(Array.from(ids))],
              [SOLANA_INTRODUCED_KEY, "1"],
            ]).catch(() => {});
          }
          setEnabledChainIds(ids);
        } else {
          // Default: Solana, Base, Robinhood Chain, Ethereum (the rest can
          // be switched on in Manage Networks)
          setEnabledChainIds(defaultEnabledIds);
          AsyncStorage.setItem(SOLANA_INTRODUCED_KEY, "1").catch(() => {});
        }
      } catch (err) {
        console.error("[ChainContext] Error loading state:", err);
        setActiveChain(getSafeDefaultChain());
        setEnabledChainIds(defaultEnabledIds);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Active chain (dApp browser / signing, EVM only) ──────────────────────────

  const switchChain = useCallback(async (chain) => {
    if (isSolanaChain(chain)) {
      throw new Error(
        "Solana is not an EVM chain and cannot be the active signing chain",
      );
    }
    const validChain = getChainById(chain.id);
    if (!validChain)
      throw new Error(`Chain ${chain.name} (${chain.id}) is not supported`);
    if (!__DEV__ && validChain.testnet)
      throw new Error("Testnet chains are not available in production");
    await AsyncStorage.setItem(
      APP_CONFIG.STORAGE_KEYS.SELECTED_CHAIN,
      chain.id.toString(),
    );
    setActiveChain(chain);
    return true;
  }, []);

  const switchChainById = useCallback(
    async (chainId) => {
      const chain = getChainById(chainId);
      if (!chain) throw new Error(`Chain with ID ${chainId} not found`);
      if (!__DEV__ && chain.testnet)
        throw new Error("Testnet chains are not available in production");
      return switchChain(chain);
    },
    [switchChain],
  );

  const resetToDefault = useCallback(async () => {
    return switchChain(getSafeDefaultChain());
  }, [switchChain, getSafeDefaultChain]);

  // ── Enabled networks (portfolio display) ─────────────────────────────────────
  // IDs are numbers for EVM chains and strings for non-EVM (e.g. "SOLANA").

  const toggleNetwork = useCallback(async (chainId) => {
    setEnabledChainIds((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(chainId)) {
        if (next.size <= 1) return prev; // always keep at least one
        next.delete(chainId);
      } else {
        next.add(chainId);
      }
      // Persist fire-and-forget (also marks the Solana rollout as done)
      AsyncStorage.multiSet([
        [ENABLED_NETWORKS_KEY, JSON.stringify(Array.from(next))],
        [SOLANA_INTRODUCED_KEY, "1"],
      ]).catch(() => {});
      return next;
    });
  }, []);

  const isNetworkEnabled = useCallback(
    (chainId) => {
      if (!enabledChainIds) return true; // loading → show all
      return enabledChainIds.has(chainId);
    },
    [enabledChainIds],
  );

  // EVM chains only (unchanged behavior: safe for code that builds EVM providers)
  const getEnabledChains = useCallback(() => {
    if (!enabledChainIds) return availableChains;
    return availableChains.filter((c) => enabledChainIds.has(c.id));
  }, [enabledChainIds, availableChains]);

  // EVM + Solana: use this for the portfolio, then split by isSolanaChain()
  const getEnabledNetworks = useCallback(() => {
    if (!enabledChainIds) return availableNetworks;
    return availableNetworks.filter((c) => enabledChainIds.has(c.id));
  }, [enabledChainIds, availableNetworks]);

  const isSolanaEnabled = SOLANA_CHAIN
    ? enabledChainIds
      ? enabledChainIds.has(SOLANA_CHAIN.id)
      : true
    : false;

  // ── Utilities ─────────────────────────────────────────────────────────────────

  // Looks up EVM chains by numeric id and non-EVM chains by key/id ("SOLANA")
  const getChain = useCallback(
    (chainId) =>
      NON_EVM_LIST.find((c) => c.id === chainId) || getChainById(chainId),
    [],
  );

  // EVM only: used for dApp / signing checks
  const isChainSupported = useCallback((chainId) => {
    const chain = getChainById(chainId);
    if (!chain) return false;
    if (!__DEV__ && chain.testnet) return false;
    return true;
  }, []);

  const getAllChains = useCallback(() => availableChains, [availableChains]);
  const getAllNetworks = useCallback(
    () => availableNetworks,
    [availableNetworks],
  );
  const getMainnetChains = useCallback(() => mainnetChains, [mainnetChains]);
  const getTestnetChains = useCallback(
    () => (__DEV__ ? allChains.filter((c) => c.testnet) : []),
    [allChains],
  );

  const value = {
    // State
    activeChain,
    loading,
    chains: availableChains, // flat EVM array — used by dApp browser and pickers
    networks: availableNetworks, // EVM + Solana, default networks first — portfolio / toggles / swap & bridge pickers

    // Solana
    solanaChain: SOLANA_CHAIN,
    isSolanaEnabled,

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

    // Chain switching (dApp browser / signing, EVM only)
    switchChain,
    switchChainById,
    resetToDefault,

    // Network enable / disable (portfolio)
    enabledChainIds,
    toggleNetwork,
    isNetworkEnabled,
    getEnabledChains,
    getEnabledNetworks,

    // Utilities
    getChain,
    isChainSupported,
    getAllChains,
    getAllNetworks,
    getMainnetChains,
    getTestnetChains,
    getAvailableChains: getAllChains,
    isSolanaChain,
    isEvmChain,
  };

  return (
    <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
  );
};

export default ChainContext;
