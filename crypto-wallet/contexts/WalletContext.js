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
  EVM_DERIVATION,
  getEvmDerivation,
} from "../utils/Wallet";
import {
  getSolBalance,
  getSolanaKeypairFromMnemonic,
  getSolanaAddressesForIndices,
} from "../utils/SolanaService"; // match the file's real name/casing
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

// ── Solana helpers ───────────────────────────────────────────────────────────
// Design: the Solana *secret key is never stored*. Only the public Solana
// address is saved on each account (in the same SecureStore record as the EVM
// address). Keys are derived from the encrypted mnemonic on demand, and
// anything Solana-related that fails must never block EVM functionality.

const SOLANA_NETWORK_ID = "SOLANA";

// Derive one Solana address, or null on failure (never throws).
const safeSolanaAddress = (mnemonic, index) => {
  try {
    return getSolanaAddressesForIndices(mnemonic, [index])[0];
  } catch (err) {
    console.warn(
      "[WalletContext] Solana address derivation failed:",
      err.message,
    );
    return null;
  }
};

// Fill in any missing `solanaAddress` on a list of accounts (public data only).
// Computes the BIP-39 seed once for all missing accounts. May throw; callers
// wrap it in try/catch. Returns { accounts, changed }.
const withSolanaAddresses = (accountList, mnemonic) => {
  const missing = accountList.filter((a) => !a.solanaAddress);
  if (missing.length === 0) return { accounts: accountList, changed: false };

  const derived = getSolanaAddressesForIndices(
    mnemonic,
    missing.map((a) => a.index ?? 0),
  );

  let next = 0;
  const accounts = accountList.map((a) =>
    a.solanaAddress ? a : { ...a, solanaAddress: derived[next++] },
  );
  return { accounts, changed: true };
};

export const WalletProvider = ({ children }) => {
  const { activeChain, isSolanaEnabled } = useChain();

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

  // Solana (kept separate from `balances` so existing code that iterates
  // EVM chain ids by key is not affected)
  const [solanaBalanceState, setSolanaBalanceState] = useState(null);
  const [loadingSolana, setLoadingSolana] = useState(false);

  // Active account's Solana address (null until backfilled on first unlock)
  const solanaAddress = useMemo(
    () => accounts[activeAccountIndex]?.solanaAddress || null,
    [accounts, activeAccountIndex],
  );

  // Only expose a balance that belongs to the currently active account
  const solanaBalance = useMemo(
    () =>
      solanaBalanceState && solanaBalanceState.address === solanaAddress
        ? solanaBalanceState
        : null,
    [solanaBalanceState, solanaAddress],
  );

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

  const loadSolanaBalance = useCallback(
    async ({ force = false } = {}) => {
      if (!solanaAddress || !isSolanaEnabled) return;
      const requestedFor = solanaAddress;

      try {
        setLoadingSolana(true);
        const balance = await getSolBalance(requestedFor, { force });
        // Tagged with its address so a late response for a previous account
        // is never shown for the current one
        setSolanaBalanceState({ ...balance, address: requestedFor });
      } catch (err) {
        console.error("[WalletContext] Error loading Solana balance:", err);
      } finally {
        setLoadingSolana(false);
      }
    },
    [solanaAddress, isSolanaEnabled],
  );

  // Re-runs when the active Solana address changes or Solana is toggled on
  useEffect(() => {
    loadSolanaBalance();
  }, [loadSolanaBalance]);

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
    setSolanaBalanceState(null);
    setLoadingSolana(false);
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
      let currentLocalWallet = localWallet;
      if (result.migrated && result.upgradedPayload) {
        console.log("[WalletContext] ✅ Migrating wallet to V3...");
        currentLocalWallet = {
          ...localWallet,
          encrypted: result.upgradedPayload,
        };
        await SecureStore.setItemAsync(
          APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
          JSON.stringify(currentLocalWallet),
        );
      }

      // One-time Solana address backfill for wallets created before Solana
      // support. The mnemonic is only available while unlocked, so this is the
      // earliest safe moment. Public addresses only, and it can never fail the
      // unlock: any error here is logged and skipped.
      try {
        const mnemonic = result.wallet?.mnemonic;
        if (mnemonic) {
          const baseAccounts = Array.isArray(currentLocalWallet.accounts)
            ? currentLocalWallet.accounts
            : accounts;
          const { accounts: filled, changed } = withSolanaAddresses(
            baseAccounts,
            mnemonic,
          );
          if (changed) {
            await SecureStore.setItemAsync(
              APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
              JSON.stringify({ ...currentLocalWallet, accounts: filled }),
            );
            setAccounts(filled);
          }
        }
      } catch (backfillErr) {
        console.warn(
          "[WalletContext] Solana address backfill skipped:",
          backfillErr.message,
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
      if (!activeAccount) throw new Error("No active account");
      const derivedAccount = createAccountFromMnemonic(
        decryptedData.mnemonic,
        activeAccount.index ?? 0,
        getEvmDerivation(localWallet),
      );

      // Safety check: never sign with a key that doesn't belong to the
      // address the user sees for this account
      if (
        activeAccount.address &&
        derivedAccount.address.toLowerCase() !==
          activeAccount.address.toLowerCase()
      ) {
        throw new Error("Derived address does not match the active account");
      }

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

  // Solana equivalent of createSignerForTransaction. Returns a web3.js Keypair
  // for the active account, derived from the encrypted mnemonic on demand.
  // Use it for one operation and let it go out of scope: don't put it in state.
  const createSolanaSignerForTransaction = async (passcode) => {
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
      if (!activeAccount) throw new Error("No active account");

      const keypair = getSolanaKeypairFromMnemonic(
        decryptedData.mnemonic,
        activeAccount.index,
      );

      // Safety check: never sign with a key that doesn't belong to the
      // Solana address the user sees for this account
      if (
        activeAccount.solanaAddress &&
        activeAccount.solanaAddress !== keypair.publicKey.toBase58()
      ) {
        throw new Error(
          "Derived Solana address does not match the active account",
        );
      }

      setEncryptionProgress(null);
      return keypair;
    } catch (err) {
      console.error(
        "[WalletContext] ❌ Error creating Solana signer:",
        err.message,
      );
      setEncryptionProgress(null);
      throw new Error("Failed to create Solana signer: " + err.message);
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
      if (chainId === SOLANA_NETWORK_ID) {
        await loadSolanaBalance({ force: true });
        return;
      }

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
    [wallet?.address, activeChain.id, loadSolanaBalance],
  );

  const refreshAllBalances = useCallback(async () => {
    // Solana runs alongside EVM; its errors are handled inside
    // loadSolanaBalance and never affect the EVM refresh
    await Promise.all([loadAllBalances(), loadSolanaBalance({ force: true })]);
  }, [wallet?.address, loadSolanaBalance]);

  const createWallet = async (localPasscode, walletName = "Main Wallet") => {
    try {
      setLoading(true);
      setError(null);
      setEncryptionProgress({ stage: "generating", progress: 0 });

      const mnemonic = generateNewMnemonic();
      // New wallets use the standard derivation (same addresses as MetaMask).
      const evmDerivation = EVM_DERIVATION.STANDARD;
      const account = createAccountFromMnemonic(mnemonic, 0, evmDerivation);

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
        // null on failure: wallet creation must not depend on Solana.
        // The next unlock backfills it.
        solanaAddress: safeSolanaAddress(mnemonic, 0),
      };

      // ✅ Clean storage format - salt is in encrypted object
      await SecureStore.setItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
        JSON.stringify({
          accounts: [firstAccount],
          activeAccountIndex: 0,
          evmDerivation,
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

  // `evmDerivation` comes from detectEvmDerivation() (or the user's choice when
  // it's ambiguous): LEGACY for phrases from older Rizon installs, STANDARD for
  // MetaMask-style phrases. It must be passed explicitly.
  const importWallet = async (
    mnemonic,
    localPasscode,
    walletName = "Imported Wallet",
    evmDerivation,
  ) => {
    try {
      if (!Object.values(EVM_DERIVATION).includes(evmDerivation)) {
        throw new Error("importWallet: missing EVM derivation");
      }
      setLoading(true);
      setError(null);
      setEncryptionProgress({ stage: "importing", progress: 0 });

      const account = createAccountFromMnemonic(mnemonic, 0, evmDerivation);

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
        solanaAddress: safeSolanaAddress(mnemonic, 0),
      };

      // ✅ Clean storage format - salt is in encrypted object
      await SecureStore.setItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
        JSON.stringify({
          accounts: [firstAccount],
          activeAccountIndex: 0,
          evmDerivation,
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

  // Decrypt and return the recovery phrase (for Cloud Backup). The caller
  // must not keep it beyond the one operation it needs it for.
  const getMnemonic = async (passcode) => {
    const localWalletJson = await SecureStore.getItemAsync(
      APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
    );
    if (!localWalletJson) throw new Error("No wallet found on this device");
    const localWallet = JSON.parse(localWalletJson);
    const { wallet: decrypted } = await decryptWallet(
      localWallet.encrypted,
      passcode,
      extractSalt(localWallet),
    );
    if (!decrypted?.mnemonic) throw new Error("This wallet has no recovery phrase");
    return decrypted.mnemonic;
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
        getEvmDerivation(localWallet),
      );

      const accountToAdd = {
        address: newAccount.address,
        name: accountName || `Account ${nextIndex + 1}`,
        index: nextIndex,
        solanaAddress: safeSolanaAddress(decryptedData.mnemonic, nextIndex),
      };

      let updatedAccounts = [...accounts, accountToAdd];

      // The mnemonic is available right now, so also fill in any older
      // accounts still missing a Solana address (best effort)
      try {
        updatedAccounts = withSolanaAddresses(
          updatedAccounts,
          decryptedData.mnemonic,
        ).accounts;
      } catch (backfillErr) {
        console.warn(
          "[WalletContext] Solana address backfill skipped:",
          backfillErr.message,
        );
      }

      await SecureStore.setItemAsync(
        APP_CONFIG.STORAGE_KEYS.LOCAL_WALLET,
        JSON.stringify({
          ...localWallet,
          accounts: updatedAccounts,
        }),
      );

      setAccounts(updatedAccounts);
      setEncryptionProgress(null);

      return updatedAccounts[updatedAccounts.length - 1];
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

  // Solana addresses for all accounts that have one
  const getAllAccountSolanaAddresses = () => {
    return accounts.map((acc) => acc.solanaAddress).filter(Boolean);
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
      if (chainId === SOLANA_NETWORK_ID) {
        return (
          solanaBalance || {
            wei: "0",
            lamports: "0",
            formatted: "0",
            symbol: "SOL",
            chainId,
            chainName: "Solana",
          }
        );
      }

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
    [balances, solanaBalance],
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

    // Solana
    solanaAddress,
    solanaBalance,
    loadingSolana,
    hasSolana: !!solanaAddress,
    createSolanaSignerForTransaction,
    getAllAccountSolanaAddresses,

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
    getMnemonic,
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
