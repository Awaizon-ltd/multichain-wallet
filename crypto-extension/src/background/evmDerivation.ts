// Decides which EVM derivation an imported recovery phrase should use.
// Mirrors crypto-wallet/utils/evmDerivationDetect.js.
//
// A phrase may come from an older Rizon mobile install (LEGACY addresses) or
// from MetaMask / any standard wallet (STANDARD). Account 1 is derived both
// ways and checked for use: a linked @username, sent transactions, a native
// balance, or any incoming transfer (Alchemy chains).
//
//   backup address hint matches one → that one
//   only LEGACY used                → LEGACY
//   only STANDARD used / none       → STANDARD
//   both used                       → ambiguous (the popup asks)
//   LEGACY couldn't be checked and STANDARD shows no use → ambiguous

import { API_BASE_URL, EVM_CHAINS } from "../shared/chains";
import { evmAddressBoth, EVM_DERIVATION, type EvmDerivation } from "./keyring";
import { evmProvider } from "./rpc";

export interface DerivationSide {
  address: string;
  used: boolean;
  checked: boolean;
}
export interface DerivationResult {
  derivation: EvmDerivation | null; // null only when ambiguous
  ambiguous: boolean;
  legacy: DerivationSide;
  standard: DerivationSide;
}

const TIMEOUT_MS = 8000;

function settle(p: Promise<boolean>): Promise<boolean | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
  return Promise.race([p.then((v) => !!v).catch(() => null), timeout]);
}

async function hasUsername(address: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/identity/by-address?address=${encodeURIComponent(address)}`);
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`identity lookup ${res.status}`);
  return true;
}

async function activityOf(address: string): Promise<{ used: boolean; checked: boolean }> {
  const checks: Promise<boolean | null>[] = [settle(hasUsername(address))];
  for (const chain of EVM_CHAINS.filter((c) => !c.testnet)) {
    const provider = evmProvider(chain.id);
    checks.push(settle(provider.getTransactionCount(address).then((n) => n > 0)));
    checks.push(settle(provider.getBalance(address).then((b) => b > 0n)));
    if (chain.rpcUrl.includes("alchemy.com")) {
      checks.push(
        settle(
          provider
            .send("alchemy_getAssetTransfers", [
              { fromBlock: "0x0", toAddress: address, category: ["external", "erc20", "erc721", "erc1155"], maxCount: "0x1", excludeZeroValue: true },
            ])
            .then((r: any) => (r?.transfers?.length ?? 0) > 0),
        ),
      );
    }
  }
  const results = await Promise.all(checks);
  return { used: results.some((r) => r === true), checked: results.some((r) => r !== null) };
}

export async function detectEvmDerivation(mnemonic: string, addressHint?: string | null): Promise<DerivationResult> {
  const { legacy, standard } = evmAddressBoth(mnemonic);

  const hint = addressHint?.toLowerCase();
  if (hint && (hint === legacy.toLowerCase() || hint === standard.toLowerCase())) {
    const isLegacy = hint === legacy.toLowerCase();
    return {
      derivation: isLegacy ? EVM_DERIVATION.LEGACY : EVM_DERIVATION.STANDARD,
      ambiguous: false,
      legacy: { address: legacy, used: isLegacy, checked: true },
      standard: { address: standard, used: !isLegacy, checked: true },
    };
  }

  const [l, s] = await Promise.all([activityOf(legacy), activityOf(standard)]);
  const base = { legacy: { address: legacy, ...l }, standard: { address: standard, ...s } };
  if (l.used && s.used) return { ...base, derivation: null, ambiguous: true };
  if (l.used) return { ...base, derivation: EVM_DERIVATION.LEGACY, ambiguous: false };
  if (s.used) return { ...base, derivation: EVM_DERIVATION.STANDARD, ambiguous: false };
  if (!l.checked) return { ...base, derivation: null, ambiguous: true };
  return { ...base, derivation: EVM_DERIVATION.STANDARD, ambiguous: false };
}
