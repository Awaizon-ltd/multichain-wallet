import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useMemo,
} from "react";
import * as SecureStore from "expo-secure-store";
import { JsonRpcProvider, Wallet } from "ethers";
import { useChain } from "./ChainContext";
import {
  generateNewMnemonic,
  createAccountFromMnemonic,
  getBalance,
  getAllBalances,
  deriveMultipleAccounts,
} from "../utils/Wallet";
import { encryptWallet, decryptWallet } from "../utils/Encryption";
import { APP_CONFIG } from "../constants/Config";
import { SUPPORTED_CHAINS } from "../constants/Chain";

const WalletContext = createContext();

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};

// ✅ HELPER: Extract salt from wallet data consistently
const extractSalt = (localWallet) => {
  // V3 and V2 store salt in encrypted.salt
  if (localWallet.encrypted?.salt) {
    return localWallet.encrypted.salt;
  }
  // V1 fallback - salt at root
  if (localWallet.salt) {
    return localWallet.salt;
  }
  return null;
};

export const WalletProvider = ({ children }) => {
  const { activeChain } = useChain();

  // Multi-account state
  const [accounts, setAccounts] = useState([]);
  const [activeAccountIndex, setActiveAccountIndex] = useState(0);
  const [wallet, setWallet] = useState(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [error, setError] = useState(null);
  const [checkingWallet, setCheckingWallet] = useState(true);
  const [hasLocalPasscode, setHasLocalPasscode] = useState(false);
  const [address, setAddress] = useState(null);
  const [encryptionProgress, setEncryptionProgress] = useState(null);

  const provider = useMemo(() => {
    if (!activeChain) {
      return null;
    }

    if (!activeChain.rpcUrl) {
      return null;
    }

    try {
      const newProvider = new JsonRpcProvider(activeChain.rpcUrl);
      newProvider.getNetwork();
      return newProvider;
    } catch (err) {
      console.error("[WalletContext] ❌ Error creating provider:", err);
      return null;
    }
  }, [activeChain?.id]);

  useEffect(() => {
    initializeWallet();
  }, []);

  useEffect(() => {
    if (accounts.length > 0 && activeAccountIndex < accounts.length) {
      const activeAccount = accounts[activeAccountIndex];
      setWallet({
        address: activeAccount.address,
        name: activeAccount.name,
      });
      setAddress(activeAccount.address);
    }
  }, [activeAccountIndex, accounts]);

  useEffect(() => {
    if (wallet?.address) {
      loadAllBalances();
    }
  }, [wallet?.address]);

  const initializeWallet = async () => {
    setCheckingWallet(true);
    try {
      await loadWalletFromSecureStore();
    } catch (err) {
      console.error("[WalletContext] Error initializing wallet:", err);
    } finally {
      setCheckingWallet(false);
    }
  };

  const loadWalletFromSecureStore = async () => {
    try {
      const localWalletJson = await SecureStore.getItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
      );

      if (localWalletJson) {
        const localWallet = JSON.parse(localWalletJson);

        if (localWallet.accounts && Array.isArray(localWallet.accounts)) {
          setAccounts(localWallet.accounts);

          const savedIndex = localWallet.activeAccountIndex || 0;
          setActiveAccountIndex(savedIndex);

          const activeAccount = localWallet.accounts[savedIndex];
          if (activeAccount) {
            setWallet({
              address: activeAccount.address,
              name: activeAccount.name,
            });
            setAddress(activeAccount.address);
          }
        } else {
          // Legacy single account format
          const legacyAccount = {
            address: localWallet.address,
            name: localWallet.name || "Account 1",
            index: 0,
          };
          setAccounts([legacyAccount]);
          setWallet({
            address: legacyAccount.address,
            name: legacyAccount.name,
          });
          setAddress(legacyAccount.address);
        }

        // Check if wallet has encryption (any version)
        const hasPasscode = !!(
          localWallet.encrypted && extractSalt(localWallet)
        );
        setHasLocalPasscode(hasPasscode);
      } else {
        setHasLocalPasscode(false);
      }
    } catch (err) {
      console.error(
        "[WalletContext] Error loading wallet from SecureStore:",
        err,
      );
      setHasLocalPasscode(false);
    }
  };

  const resetWalletState = () => {
    setWallet(null);
    setAccounts([]);
    setActiveAccountIndex(0);
    setIsAuthenticated(false);
    setBalances({});
    setHasLocalPasscode(false);
    setCheckingWallet(false);
    setAddress(null);
    setEncryptionProgress(null);
  };

  const authenticateWithPasscode = async (passcode) => {
    try {
      setEncryptionProgress({ stage: "authenticating", progress: 0 });

      const localWalletJson = await SecureStore.getItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
      );
      if (!localWalletJson) throw new Error("No local wallet found");

      const localWallet = JSON.parse(localWalletJson);
      const salt = extractSalt(localWallet);

      if (!salt) {
        throw new Error("No salt found in wallet data");
      }

      const result = await decryptWallet(
        localWallet.encrypted,
        passcode,
        salt,
        (progress) => {
          setEncryptionProgress({
            stage: progress.stage,
            progress: progress.progress,
          });
        },
      );

      // Handle migration from V1/V2 to V3
      if (result.migrated && result.upgradedPayload) {
        console.log("[WalletContext] ✅ Migrating wallet to V3...");
        await SecureStore.setItemAsync(
          APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
          JSON.stringify({
            ...localWallet,
            encrypted: result.upgradedPayload,
          }),
        );
      }

      setIsAuthenticated(true);
      setEncryptionProgress(null);
      return true;
    } catch (err) {
      console.error("[WalletContext] ❌ Authentication failed:", err.message);
      setIsAuthenticated(false);
      setEncryptionProgress(null);
      throw new Error("Invalid passcode");
    }
  };

  const createSignerForTransaction = async (passcode) => {
    try {
      setEncryptionProgress({ stage: "preparing", progress: 0 });

      const localWalletJson = await SecureStore.getItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
      );

      if (!localWalletJson) throw new Error("No local wallet found");

      const localWallet = JSON.parse(localWalletJson);
      const salt = extractSalt(localWallet);

      if (!salt) {
        throw new Error("No salt found in wallet data");
      }

      const {
        wallet: decryptedData,
        migrated,
        upgradedPayload,
      } = await decryptWallet(
        localWallet.encrypted,
        passcode,
        salt,
        (progress) => {
          setEncryptionProgress({
            stage: progress.stage,
            progress: progress.progress,
          });
        },
      );

      // Handle migration from V1/V2 to V3
      if (migrated && upgradedPayload) {
        console.log("[WalletContext] ✅ Migrating wallet to V3...");
        await SecureStore.setItemAsync(
          APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
          JSON.stringify({
            ...localWallet,
            encrypted: upgradedPayload,
          }),
        );
      }

      const activeAccount = accounts[activeAccountIndex];
      const derivedAccount = createAccountFromMnemonic(
        decryptedData.mnemonic,
        activeAccount.index,
      );

      let privateKeyHex;
      if (
        typeof derivedAccount.privateKey === "object" &&
        derivedAccount.privateKey !== null
      ) {
        const bytes = Object.values(derivedAccount.privateKey);
        privateKeyHex =
          "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
      } else if (typeof derivedAccount.privateKey === "string") {
        privateKeyHex = derivedAccount.privateKey.startsWith("0x")
          ? derivedAccount.privateKey
          : "0x" + derivedAccount.privateKey;
      } else {
        throw new Error("Invalid privateKey format");
      }

      if (!provider) {
        throw new Error(
          "Provider not available. Please wait for provider to initialize.",
        );
      }

      const walletSigner = new Wallet(privateKeyHex, provider);
      setEncryptionProgress(null);
      return walletSigner;
    } catch (err) {
      console.error("[WalletContext] ❌ Error creating signer:", err.message);
      setEncryptionProgress(null);
      throw new Error("Failed to create signer: " + err.message);
    }
  };

  const lockWallet = () => {
    setIsAuthenticated(false);
  };

  const loadAllBalances = async () => {
    if (!wallet?.address) return;

    try {
      setLoadingBalances(true);
      const allBalances = await getAllBalances(wallet.address);
      setBalances(allBalances);
    } catch (err) {
      console.error("[WalletContext] Error loading balances:", err);
    } finally {
      setLoadingBalances(false);
    }
  };

  const refreshBalance = useCallback(
    async (chainId = null) => {
      if (!wallet?.address) return;

      try {
        const targetChainId = chainId || activeChain.id;
        const chain = Object.values(SUPPORTED_CHAINS).find(
          (c) => c.id === targetChainId,
        );

        if (!chain) {
          console.error("Chain not found:", targetChainId);
          return;
        }

        const balance = await getBalance(wallet.address, chain);

        setBalances((prev) => ({
          ...prev,
          [chain.id]: balance,
        }));
      } catch (err) {
        console.error("[WalletContext] Error refreshing balance:", err);
      }
    },
    [wallet?.address, activeChain.id],
  );

  const refreshAllBalances = useCallback(async () => {
    await loadAllBalances();
  }, [wallet?.address]);

  const createWallet = async (localPasscode, walletName = "Main Wallet") => {
    try {
      setLoading(true);
      setError(null);
      setEncryptionProgress({ stage: "generating", progress: 0 });

      const mnemonic = generateNewMnemonic();
      const account = createAccountFromMnemonic(mnemonic, 0);

      const walletData = {
        mnemonic,
        privateKey: account.privateKey,
        publicKey: account.publicKey,
        createdAt: new Date().toISOString(),
      };

      setEncryptionProgress({ stage: "encrypting", progress: 0.2 });

      const encryptedPayload = await encryptWallet(
        walletData,
        localPasscode,
        (progress) => {
          setEncryptionProgress({
            stage: progress.stage,
            progress: 0.2 + progress.progress * 0.6,
          });
        },
      );

      setEncryptionProgress({ stage: "saving", progress: 0.9 });

      const firstAccount = {
        address: account.address,
        name: walletName,
        index: 0,
      };

      // ✅ Clean storage format - salt is in encrypted object
      await SecureStore.setItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
        JSON.stringify({
          accounts: [firstAccount],
          activeAccountIndex: 0,
          encrypted: encryptedPayload,
        }),
      );

      setAccounts([firstAccount]);
      setActiveAccountIndex(0);
      setWallet({
        name: firstAccount.name,
        address: firstAccount.address,
      });
      setAddress(firstAccount.address);

      setHasLocalPasscode(true);
      setIsAuthenticated(true);
      setEncryptionProgress(null);

      return {
        wallet: { name: firstAccount.name, address: firstAccount.address },
        mnemonic,
      };
    } catch (err) {
      console.error("Error creating wallet:", err);
      setError(err.message);
      setEncryptionProgress(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const importWallet = async (
    mnemonic,
    localPasscode,
    walletName = "Imported Wallet",
  ) => {
    try {
      setLoading(true);
      setError(null);
      setEncryptionProgress({ stage: "importing", progress: 0 });

      const account = createAccountFromMnemonic(mnemonic, 0);

      const walletData = {
        mnemonic,
        privateKey: account.privateKey,
        publicKey: account.publicKey,
        imported: true,
        createdAt: new Date().toISOString(),
      };

      setEncryptionProgress({ stage: "encrypting", progress: 0.2 });

      const encryptedPayload = await encryptWallet(
        walletData,
        localPasscode,
        (progress) => {
          setEncryptionProgress({
            stage: progress.stage,
            progress: 0.2 + progress.progress * 0.6,
          });
        },
      );

      setEncryptionProgress({ stage: "saving", progress: 0.9 });

      const firstAccount = {
        address: account.address,
        name: walletName,
        index: 0,
      };

      // ✅ Clean storage format - salt is in encrypted object
      await SecureStore.setItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
        JSON.stringify({
          accounts: [firstAccount],
          activeAccountIndex: 0,
          encrypted: encryptedPayload,
        }),
      );

      setAccounts([firstAccount]);
      setActiveAccountIndex(0);
      setWallet({
        name: firstAccount.name,
        address: firstAccount.address,
      });
      setAddress(firstAccount.address);

      setHasLocalPasscode(true);
      setIsAuthenticated(true);
      setEncryptionProgress(null);

      return account.address;
    } catch (err) {
      console.error("Error importing wallet:", err);
      setError(err.message);
      setEncryptionProgress(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const addAccount = async (passcode, accountName = null) => {
    try {
      setLoading(true);
      setEncryptionProgress({ stage: "adding", progress: 0 });

      const localWalletJson = await SecureStore.getItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
      );

      if (!localWalletJson) throw new Error("No local wallet found");

      const localWallet = JSON.parse(localWalletJson);
      const salt = extractSalt(localWallet);

      if (!salt) {
        throw new Error("No salt found in wallet data");
      }

      const {
        wallet: decryptedData,
        migrated,
        upgradedPayload,
      } = await decryptWallet(
        localWallet.encrypted,
        passcode,
        salt,
        (progress) => {
          setEncryptionProgress({
            stage: progress.stage,
            progress: progress.progress * 0.8,
          });
        },
      );

      // Handle migration from V1/V2 to V3
      if (migrated && upgradedPayload) {
        console.log("[WalletContext] ✅ Migrating wallet to V3...");
        localWallet.encrypted = upgradedPayload;
      }

      setEncryptionProgress({ stage: "deriving", progress: 0.9 });

      const nextIndex = accounts.length;
      const newAccount = createAccountFromMnemonic(
        decryptedData.mnemonic,
        nextIndex,
      );

      const accountToAdd = {
        address: newAccount.address,
        name: accountName || `Account ${nextIndex + 1}`,
        index: nextIndex,
      };

      const updatedAccounts = [...accounts, accountToAdd];

      await SecureStore.setItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
        JSON.stringify({
          ...localWallet,
          accounts: updatedAccounts,
        }),
      );

      setAccounts(updatedAccounts);
      setEncryptionProgress(null);

      return accountToAdd;
    } catch (err) {
      console.error("[WalletContext] Error adding account:", err);
      setEncryptionProgress(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const switchAccount = async (index) => {
    try {
      if (index < 0 || index >= accounts.length) {
        throw new Error("Invalid account index");
      }

      setActiveAccountIndex(index);

      const localWalletJson = await SecureStore.getItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
      );

      if (localWalletJson) {
        const localWallet = JSON.parse(localWalletJson);
        await SecureStore.setItemAsync(
          APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
          JSON.stringify({
            ...localWallet,
            activeAccountIndex: index,
          }),
        );
      }

      return accounts[index];
    } catch (err) {
      console.error("[WalletContext] Error switching account:", err);
      throw err;
    }
  };

  const renameAccount = async (index, newName) => {
    try {
      if (index < 0 || index >= accounts.length) {
        throw new Error("Invalid account index");
      }

      const updatedAccounts = [...accounts];
      updatedAccounts[index] = {
        ...updatedAccounts[index],
        name: newName,
      };

      const localWalletJson = await SecureStore.getItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
      );

      if (localWalletJson) {
        const localWallet = JSON.parse(localWalletJson);
        await SecureStore.setItemAsync(
          APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
          JSON.stringify({
            ...localWallet,
            accounts: updatedAccounts,
          }),
        );
      }

      setAccounts(updatedAccounts);

      return updatedAccounts[index];
    } catch (err) {
      console.error("[WalletContext] Error renaming account:", err);
      throw err;
    }
  };

  const getAllAccountAddresses = () => {
    return accounts.map((acc) => acc.address);
  };

  const clearLocalWallet = async () => {
    try {
      await SecureStore.deleteItemAsync(APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET);
      resetWalletState();
      return true;
    } catch (err) {
      console.error("Error clearing local wallet:", err);
      throw err;
    }
  };

  const getBalanceForChain = useCallback(
    (chainId) => {
      const chain = Object.values(SUPPORTED_CHAINS).find(
        (c) => c.id === chainId,
      );
      return (
        balances[chainId] || {
          wei: "0",
          formatted: "0",
          symbol: chain?.symbol || "ETH",
          chainId,
          chainName: chain?.name || "Unknown",
        }
      );
    },
    [balances],
  );

  const getActiveChainBalance = useCallback(() => {
    return getBalanceForChain(activeChain.id);
  }, [activeChain.id, getBalanceForChain]);

  const value = {
    // Wallet data
    wallet,
    isAuthenticated,
    address,
    provider,
    selectedChain: activeChain,
    balances,
    loading,
    loadingBalances,
    error,

    // Encryption progress
    encryptionProgress,

    // Multi-account support
    accounts,
    activeAccountIndex,
    addAccount,
    switchAccount,
    renameAccount,
    getAllAccountAddresses,

    // Wallet operations
    createWallet,
    importWallet,
    clearLocalWallet,

    // Authentication
    authenticateWithPasscode,
    createSignerForTransaction,
    lockWallet,
    setIsAuthenticated,

    // Balance operations
    refreshBalance,
    refreshAllBalances,
    getBalanceForChain,
    getActiveChainBalance,

    // Status
    hasWallet: !!wallet,
    checkingWallet,
    hasLocalPasscode,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
};
