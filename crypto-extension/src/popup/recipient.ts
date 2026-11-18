// Turns what the user typed into a recipient address: a raw address, or an
// @username resolved through the Rizon identity service (same as mobile).

import { getAddress, isAddress } from "ethers";
import { b58decode } from "../shared/base58";
import { identityByUsername } from "./data";

export type RecipientKind = "evm" | "solana";

export interface Resolved {
  address: string;
  username?: string;
}

export function validateAddress(kind: RecipientKind, v: string): string | null {
  const s = v.trim();
  if (kind === "solana") {
    try {
      return b58decode(s).length === 32 ? null : "That isn't a Solana address";
    } catch {
      return "That isn't a Solana address";
    }
  }
  if (!isAddress(s)) return "That isn't a valid address";
  try {
    getAddress(s);
    return null;
  } catch {
    return "Address checksum is wrong — check for a typo";
  }
}

export async function resolveRecipient(kind: RecipientKind, input: string): Promise<Resolved> {
  const s = input.trim();
  // "@name" is always a username; a bare "name" is one only if it isn't a valid address.
  const addressError = validateAddress(kind, s);
  if (s.startsWith("@") || (addressError && /^[a-zA-Z0-9_]{3,20}$/.test(s))) {
    const id = await identityByUsername(s);
    if (!id) throw new Error(`No Rizon wallet is linked to @${s.replace(/^@/, "")}`);
    const address = kind === "solana" ? id.solana_address : id.evm_address ? getAddress(id.evm_address) : "";
    if (!address) throw new Error(`@${id.username} has no ${kind === "solana" ? "Solana" : "EVM"} address`);
    return { address, username: id.username };
  }
  if (addressError) throw new Error(addressError);
  return { address: kind === "solana" ? s : getAddress(s) };
}
