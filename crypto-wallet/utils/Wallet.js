import { ethers } from "ethers";
import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { APP_CONFIG } from "../constants/Config";
import { SUPPORTED_CHAINS } from "../constants/Chain";

/**
 * Generate a new mnemonic phrase
 * @returns {string} 12-word mnemonic phrase
 */
export const generateNewMnemonic = () => {
  return generateMnemonic(wordlist, APP_CONFIG.MNEMONIC_STRENGTH);
};

/**
 * Validate mnemonic phrase
 * @param {string} mnemonic - Mnemonic to validate
 * @returns {boolean} Is valid
 */
export const isValidMnemonic = (mnemonic) => {
  return validateMnemonic(mnemonic, wordlist);
};

/**
 * Create account from mnemonic
 * @param {string} mnemonic - Mnemonic phrase
 * @param {number} accountIndex - Account derivation index
 * @returns {object} Account object with address and private key
 */
export const createAccountFromMnemonic = (mnemonic, accountIndex = 0) => {
  if (!isValidMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  const path = `m/44'/60'/0'/0/${accountIndex}`;
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, path);

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    publicKey: wallet.publicKey,
    index: accountIndex,
  };
};

/**
 * Derive multiple accounts from a single mnemonic
 * @param {string} mnemonic - Mnemonic phrase
 * @param {number} count - Number of accounts to derive
 * @param {number} startIndex - Starting index (default: 0)
 * @returns {Array} Array of account objects
 */
export const deriveMultipleAccounts = (mnemonic, count = 5, startIndex = 0) => {
  if (!isValidMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  const accounts = [];

  for (let i = 0; i < count; i++) {
    const index = startIndex + i;
    const account = createAccountFromMnemonic(mnemonic, index);
    accounts.push({
      ...account,
      name: `Account ${index + 1}`,
    });
  }

  return accounts;
};

/**
 * Create account from private key
 * @param {string} privateKey - Private key (with or without 0x prefix)
 * @returns {object} Account object
 */
export const createAccountFromPrivateKey = (privateKey) => {
  // Ensure private key has 0x prefix
  const formattedKey = privateKey.startsWith("0x")
    ? privateKey
    : `0x${privateKey}`;

  const wallet = new ethers.Wallet(formattedKey);

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    publicKey: wallet.publicKey,
  };
};

/**
 * Create a JSON-RPC provider for a specific chain
 * @param {object} chain - Chain configuration
 * @returns {ethers.JsonRpcProvider} JSON-RPC provider
 */
export const createProviderForChain = (chain) => {
  return new ethers.JsonRpcProvider(chain.rpcUrl, {
    chainId: chain.id,
    name: chain.name,
  });
};

/**
 * Create a wallet instance with provider
 * @param {string} privateKey - Private key
 * @param {object} chain - Chain configuration
 * @returns {ethers.Wallet} Wallet instance connected to provider
 */
export const createWalletWithProvider = (privateKey, chain) => {
  const provider = createProviderForChain(chain);
  const wallet = new ethers.Wallet(privateKey, provider);
  return wallet;
};

/**
 * Get balance for an address on a specific chain
 * @param {string} address - Wallet address
 * @param {object} chain - Chain configuration
 * @returns {Promise<object>} Balance in wei and formatted with chain info
 */
export const getBalance = async (address, chain) => {
  try {
    const provider = createProviderForChain(chain);
    // Always fetch from the latest block to avoid stale data
    const balance = await provider.getBalance(address, "latest");

    return {
      wei: balance.toString(),
      formatted: ethers.formatEther(balance),
      symbol: chain.symbol,
      chainId: chain.id,
      chainName: chain.name,
    };
  } catch (error) {
    console.error(`Error fetching balance for ${chain.name}:`, error);
    throw error;
  }
};

/**
 * Get balances for an address across all supported chains
 * @param {string} address - Wallet address
 * @returns {Promise<object>} Balances keyed by chain ID with chain info
 */
export const getAllBalances = async (address) => {
  const balances = {};

  const balancePromises = Object.values(SUPPORTED_CHAINS).map(async (chain) => {
    try {
      const balance = await getBalance(address, chain);
      return {
        chainId: chain.id,
        balance,
      };
    } catch (error) {
      console.error(`Error fetching balance for ${chain.name}:`, error);
      return {
        chainId: chain.id,
        balance: {
          wei: "0",
          formatted: "0",
          symbol: chain.symbol,
          chainId: chain.id,
          chainName: chain.name,
        },
      };
    }
  });

  const results = await Promise.all(balancePromises);

  // Convert array to object keyed by chainId
  results.forEach(({ chainId, balance }) => {
    balances[chainId] = balance;
  });

  return balances;
};

/**
 * Get balances for multiple accounts across all chains
 * @param {Array<string>} addresses - Array of wallet addresses
 * @returns {Promise<object>} Balances keyed by address, then by chain ID
 */
export const getMultiAccountBalances = async (addresses) => {
  const allBalances = {};

  const promises = addresses.map(async (address) => {
    try {
      const balances = await getAllBalances(address);
      return { address, balances };
    } catch (error) {
      console.error(`Error fetching balances for ${address}:`, error);
      return { address, balances: {} };
    }
  });

  const results = await Promise.all(promises);

  results.forEach(({ address, balances }) => {
    allBalances[address] = balances;
  });

  return allBalances;
};

/**
 * Get total balance across all accounts for a specific chain
 * @param {Array<string>} addresses - Array of wallet addresses
 * @param {number} chainId - Chain ID
 * @returns {Promise<object>} Total balance for the chain
 */
export const getTotalBalanceAcrossAccounts = async (addresses, chainId) => {
  const chain = Object.values(SUPPORTED_CHAINS).find((c) => c.id === chainId);
  if (!chain) {
    throw new Error(`Chain with ID ${chainId} not found`);
  }

  const balancePromises = addresses.map((address) =>
    getBalance(address, chain),
  );
  const balances = await Promise.all(balancePromises);

  // Sum up all balances in wei
  const totalWei = balances.reduce((sum, balance) => {
    return sum + BigInt(balance.wei);
  }, BigInt(0));

  return {
    wei: totalWei.toString(),
    formatted: ethers.formatEther(totalWei),
    symbol: chain.symbol,
    chainId: chain.id,
    chainName: chain.name,
    accountCount: addresses.length,
  };
};

/**
 * Get balance for a specific chain by chain ID
 * @param {string} address - Wallet address
 * @param {number} chainId - Chain ID
 * @returns {Promise<object>} Balance for the chain
 */
export const getBalanceByChainId = async (address, chainId) => {
  const chain = Object.values(SUPPORTED_CHAINS).find((c) => c.id === chainId);
  if (!chain) {
    throw new Error(`Chain with ID ${chainId} not found`);
  }
  return getBalance(address, chain);
};

/**
 * Send transaction
 * @param {ethers.Wallet} wallet - Wallet instance with provider
 * @param {string} to - Recipient address
 * @param {string} amount - Amount in ether (will be converted to wei)
 * @returns {Promise<string>} Transaction hash
 */
export const sendTransaction = async (wallet, to, amount) => {
  try {
    const tx = await wallet.sendTransaction({
      to,
      value: ethers.parseEther(amount),
    });

    return tx.hash;
  } catch (error) {
    console.error("Error sending transaction:", error);
    throw error;
  }
};

/**
 * Wait for transaction receipt
 * @param {ethers.JsonRpcProvider} provider - Provider instance
 * @param {string} hash - Transaction hash
 * @param {number} confirmations - Number of confirmations to wait for
 * @returns {Promise<object>} Transaction receipt
 */
export const waitForTransaction = async (provider, hash, confirmations = 1) => {
  try {
    const receipt = await provider.waitForTransaction(hash, confirmations);
    return receipt;
  } catch (error) {
    console.error("Error waiting for transaction:", error);
    throw error;
  }
};

/**
 * Get transaction by hash
 * @param {ethers.JsonRpcProvider} provider - Provider instance
 * @param {string} hash - Transaction hash
 * @returns {Promise<object>} Transaction details
 */
export const getTransaction = async (provider, hash) => {
  try {
    const transaction = await provider.getTransaction(hash);
    return transaction;
  } catch (error) {
    console.error("Error fetching transaction:", error);
    throw error;
  }
};

/**
 * Estimate gas for a transaction
 * @param {ethers.JsonRpcProvider} provider - Provider instance
 * @param {string} from - Sender address
 * @param {string} to - Recipient address
 * @param {string} value - Value in wei or ether string
 * @returns {Promise<bigint>} Estimated gas
 */
export const estimateGas = async (provider, from, to, value) => {
  try {
    const gas = await provider.estimateGas({
      from,
      to,
      value:
        typeof value === "string" && !value.startsWith("0x")
          ? ethers.parseEther(value)
          : value,
    });
    return gas;
  } catch (error) {
    console.error("Error estimating gas:", error);
    throw error;
  }
};

/**
 * Get current gas price (legacy)
 * @param {ethers.JsonRpcProvider} provider - Provider instance
 * @returns {Promise<bigint>} Gas price in wei
 */
export const getGasPrice = async (provider) => {
  try {
    const feeData = await provider.getFeeData();
    return feeData.gasPrice;
  } catch (error) {
    console.error("Error fetching gas price:", error);
    throw error;
  }
};

/**
 * Get EIP-1559 fee data
 * @param {ethers.JsonRpcProvider} provider - Provider instance
 * @returns {Promise<object>} Fee data with maxFeePerGas and maxPriorityFeePerGas
 */
export const getFeeData = async (provider) => {
  try {
    const feeData = await provider.getFeeData();
    return {
      gasPrice: feeData.gasPrice?.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
    };
  } catch (error) {
    console.error("Error fetching fee data:", error);
    throw error;
  }
};

/**
 * Validate Ethereum address
 * @param {string} address - Address to validate
 * @returns {boolean} Is valid address
 */
export const isValidAddress = (address) => {
  return ethers.isAddress(address);
};

/**
 * Format address for display (0x1234...5678)
 * @param {string} address - Full address
 * @param {number} chars - Number of chars to show on each side
 * @returns {string} Formatted address
 */
export const formatAddress = (address, chars = 4) => {
  if (!address) return "";
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
};

/**
 * Get block number
 * @param {ethers.JsonRpcProvider} provider - Provider instance
 * @returns {Promise<number>} Current block number
 */
export const getBlockNumber = async (provider) => {
  try {
    return await provider.getBlockNumber();
  } catch (error) {
    console.error("Error fetching block number:", error);
    throw error;
  }
};

/**
 * Get network information
 * @param {ethers.JsonRpcProvider} provider - Provider instance
 * @returns {Promise<object>} Network information
 */
export const getNetwork = async (provider) => {
  try {
    return await provider.getNetwork();
  } catch (error) {
    console.error("Error fetching network:", error);
    throw error;
  }
};
