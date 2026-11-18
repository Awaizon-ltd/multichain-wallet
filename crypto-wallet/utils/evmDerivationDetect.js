// Decides which EVM derivation an imported recovery phrase should use.
//
// A phrase may come from an older Rizon install (LEGACY addresses) or from
// MetaMask / any standard wallet (STANDARD addresses). We derive account 1 both
// ways and look for signs of use on each: a linked @username, sent
// transactions, a native balance, or any incoming transfer (Alchemy chains).
//
//   only LEGACY used          → LEGACY
//   only STANDARD used / none → STANDARD
//   both used                 → ambiguous (ask the user)
//   LEGACY couldn't be checked and STANDARD shows no use → ambiguous (ask),
//     so an offline restore never silently hides an existing Rizon wallet.
import { getMainnetChains } from "../constants/Chain";
import { createProviderForChain } from "./blockchain/Providers";
import { ALCHEMY_NETWORK_MAP } from "./blockchain/Alchemy";
import { getIdentityByAddress } from "../services/identity";
import { EVM_DERIVATION, createAccountFromMnemonic } from "./Wallet";

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

// Each check resolves to true (used), false (checked, unused) or null (couldn't check).
const settle = (promise, ms) => withTimeout(promise, ms).then((v) => !!v, () => null);

async function activityOf(address, timeoutMs) {
  const checks = [settle(getIdentityByAddress(address).then((row) => !!row), timeoutMs)];
  for (const chain of getMainnetChains()) {
    if (!chain.rpcUrl) continue;
    const provider = createProviderForChain(chain);
    checks.push(settle(provider.getTransactionCount(address).then((n) => n > 0), timeoutMs));
    checks.push(settle(provider.getBalance(address).then((b) => b > 0n), timeoutMs));
    if (ALCHEMY_NETWORK_MAP[chain.id]) {
      checks.push(
        settle(
          provider
            .send("alchemy_getAssetTransfers", [
              { fromBlock: "0x0", toAddress: address, category: ["external", "erc20", "erc721", "erc1155"], maxCount: "0x1", excludeZeroValue: true },
            ])
            .then((r) => (r?.transfers?.length ?? 0) > 0),
          timeoutMs,
        ),
      );
    }
  }
  const results = await Promise.all(checks);
  return {
    used: results.some((r) => r === true),
    checked: results.some((r) => r !== null),
  };
}

/**
 * @returns {Promise<{ derivation: string|null, ambiguous: boolean,
 *   legacy: { address, used, checked }, standard: { address, used, checked } }>}
 *   derivation is null only when ambiguous.
 */
export async function detectEvmDerivation(mnemonic, { timeoutMs = 8000, addressHint = null } = {}) {
  const legacyAddress = createAccountFromMnemonic(mnemonic, 0, EVM_DERIVATION.LEGACY).address;
  const standardAddress = createAccountFromMnemonic(mnemonic, 0, EVM_DERIVATION.STANDARD).address;

  // A Google Drive backup records the wallet's first EVM address: exact answer, no network needed.
  const hint = addressHint?.toLowerCase();
  if (hint === legacyAddress.toLowerCase() || hint === standardAddress.toLowerCase()) {
    const isLegacy = hint === legacyAddress.toLowerCase();
    return {
      derivation: isLegacy ? EVM_DERIVATION.LEGACY : EVM_DERIVATION.STANDARD,
      ambiguous: false,
      legacy: { address: legacyAddress, used: isLegacy, checked: true },
      standard: { address: standardAddress, used: !isLegacy, checked: true },
    };
  }
  const [legacy, standard] = await Promise.all([activityOf(legacyAddress, timeoutMs), activityOf(standardAddress, timeoutMs)]);

  const result = {
    legacy: { address: legacyAddress, ...legacy },
    standard: { address: standardAddress, ...standard },
  };
  if (legacy.used && standard.used) return { ...result, derivation: null, ambiguous: true };
  if (legacy.used) return { ...result, derivation: EVM_DERIVATION.LEGACY, ambiguous: false };
  if (standard.used) return { ...result, derivation: EVM_DERIVATION.STANDARD, ambiguous: false };
  if (!legacy.checked) return { ...result, derivation: null, ambiguous: true };
  return { ...result, derivation: EVM_DERIVATION.STANDARD, ambiguous: false };
}
