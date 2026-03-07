import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CHAIN, SUPPORTED_CHAINS, getChainById } from '../constants/Chain';
import { APP_CONFIG } from '../constants/Config';

const ChainContext = createContext();

export const useChain = () => {
  const context = useContext(ChainContext);
  if (!context) {
    throw new Error('useChain must be used within a ChainProvider');
  }
  return context;
};

export const ChainProvider = ({ children }) => {
  const [activeChain, setActiveChain] = useState(DEFAULT_CHAIN);
  const [loading, setLoading] = useState(true);

  // Load saved chain from storage on mount
  useEffect(() => {
    loadActiveChain();
  }, []);

  /**
   * Filter chains based on environment
   * In production: Only mainnet chains
   * In development: All chains
   */
  const getAvailableChains = useCallback(() => {
    const allChains = Object.values(SUPPORTED_CHAINS);
    
    if (__DEV__) {
      return allChains;
    } else {
      // Production: Only mainnet chains
      const mainnetChains = allChains.filter(chain => !chain.testnet);
      return mainnetChains;
    }
  }, []);

  /**
   * Get a safe default chain (mainnet only in production)
   */
  const getSafeDefaultChain = useCallback(() => {
    if (__DEV__) {
      return DEFAULT_CHAIN;
    } else {
      // In production, if DEFAULT_CHAIN is a testnet, use the first mainnet chain
      if (DEFAULT_CHAIN.testnet) {
        const mainnetChains = Object.values(SUPPORTED_CHAINS).filter(chain => !chain.testnet);
        return mainnetChains[0] || DEFAULT_CHAIN; // Fallback to DEFAULT_CHAIN if no mainnet found
      }
      return DEFAULT_CHAIN;
    }
  }, []);

  /**
   * Load the active chain from AsyncStorage
   */
  const loadActiveChain = async () => {
    try {
      setLoading(true);
      const savedChainId = await AsyncStorage.getItem(APP_CONFIG.STORAGE_KEYS.SELECTED_CHAIN);
      
      if (savedChainId) {
        const chain = getChainById(parseInt(savedChainId));
        
        // Check if chain exists and is available in current environment
        if (chain) {
          // In production, reject testnet chains
          if (!__DEV__ && chain.testnet) {
     
            const safeDefault = getSafeDefaultChain();
            setActiveChain(safeDefault);
            // Update storage with safe default
            await AsyncStorage.setItem(APP_CONFIG.STORAGE_KEYS.SELECTED_CHAIN, safeDefault.id.toString());
          } else {
     
            setActiveChain(chain);
          }
        } else {
   
          setActiveChain(getSafeDefaultChain());
        }
      } else {
 
        setActiveChain(getSafeDefaultChain());
      }
    } catch (error) {
      console.error('[ChainContext] Error loading active chain:', error);
      setActiveChain(getSafeDefaultChain());
    } finally {
      setLoading(false);
    }
  };

  /**
   * Switch to a different chain
   */
  const switchChain = useCallback(async (chain) => {
    try {
  
      
      // Validate chain exists in supported chains
      const validChain = getChainById(chain.id);
      if (!validChain) {
        throw new Error(`Chain ${chain.name} (${chain.id}) is not supported`);
      }

      // In production, prevent switching to testnet chains
      if (!__DEV__ && validChain.testnet) {
        throw new Error(`Testnet chains are not available in production`);
      }

      // Save to storage
      await AsyncStorage.setItem(APP_CONFIG.STORAGE_KEYS.SELECTED_CHAIN, chain.id.toString());
      
      // Update state
      setActiveChain(chain);
      
      return true;
    } catch (error) {
      console.error('[ChainContext] Error switching chain:', error);
      throw error;
    }
  }, []);

  /**
   * Switch to chain by ID
   */
  const switchChainById = useCallback(async (chainId) => {
    const chain = getChainById(chainId);
    if (!chain) {
      throw new Error(`Chain with ID ${chainId} not found`);
    }
    
    // In production, prevent switching to testnet chains
    if (!__DEV__ && chain.testnet) {
      throw new Error(`Testnet chains are not available in production`);
    }
    
    return switchChain(chain);
  }, [switchChain]);

  /**
   * Reset to default chain
   */
  const resetToDefault = useCallback(async () => {
    const safeDefault = getSafeDefaultChain();
    return switchChain(safeDefault);
  }, [switchChain, getSafeDefaultChain]);

  /**
   * Get chain by ID
   */
  const getChain = useCallback((chainId) => {
    return getChainById(chainId);
  }, []);

  /**
   * Check if chain is supported (and available in current environment)
   */
  const isChainSupported = useCallback((chainId) => {
    const chain = getChainById(chainId);
    if (!chain) return false;
    
    // In production, testnet chains are not supported
    if (!__DEV__ && chain.testnet) return false;
    
    return true;
  }, []);

  /**
   * Get all supported chains (respects environment)
   */
  const getAllChains = useCallback(() => {
    return getAvailableChains();
  }, [getAvailableChains]);

  /**
   * Get mainnet chains only
   */
  const getMainnetChains = useCallback(() => {
    return Object.values(SUPPORTED_CHAINS).filter(chain => !chain.testnet);
  }, []);

  /**
   * Get testnet chains only (empty in production)
   */
  const getTestnetChains = useCallback(() => {
    if (!__DEV__) {
      // Production: No testnets
      return [];
    }
    return Object.values(SUPPORTED_CHAINS).filter(chain => chain.testnet);
  }, []);

  const value = {
    // State
    activeChain,
    loading,
    
    // Chain info
    chainId: activeChain.id,
    chainName: activeChain.name,
    chainSymbol: activeChain.symbol,
    chainExplorer: activeChain.explorer,
    chainIcon: activeChain.icon,
    isTestnet: activeChain.testnet,
    
    // Environment info
    isProduction: !__DEV__,
    isDevelopment: __DEV__,
    
    // Actions
    switchChain,
    switchChainById,
    resetToDefault,
    
    // Utilities
    getChain,
    isChainSupported,
    getAllChains,
    getMainnetChains,
    getTestnetChains,
    getAvailableChains,
  };

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
};

export default ChainContext;