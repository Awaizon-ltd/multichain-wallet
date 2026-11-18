// @username linking — same protocol as crypto-wallet/services/identity.js.
// The backend issues a one-time challenge; we sign it with the account's EVM
// key (EIP-191) and Solana key (ed25519 over the same UTF-8 bytes), and the
// backend verifies both before linking. Signatures live only in this function.

import { ed25519 } from "@noble/curves/ed25519.js";
import { API_BASE_URL } from "../shared/chains";
import { USERNAME_RE } from "../shared/config";
import { b58encode } from "../shared/base58";
import type { Account } from "../shared/messages";
import { evmSigner, solanaSigner } from "./keyring";
import { withMnemonic } from "./wallet";

async function post(path: string, body: unknown) {
  const r = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.message || `Request failed (${r.status})`);
  return j.data;
}

export async function linkUsername(account: Account, rawUsername: string) {
  const username = rawUsername.trim().replace(/^@/, "").toLowerCase();
  if (!USERNAME_RE.test(username)) throw new Error("Usernames are 3–20 characters: letters, numbers and _.");
  const challenge = await post("/identity/challenge", {
    username,
    evm_address: account.evm,
    solana_address: account.solana,
  });
  // Only sign a link message for exactly this username and these two addresses.
  const msg = challenge?.message;
  if (
    typeof msg !== "string" ||
    !msg.startsWith(`Rizon wants you to link this wallet to @${username}\n`) ||
    !msg.includes(`EVM address: ${account.evm}`) ||
    !msg.includes(`Solana address: ${account.solana}`)
  ) {
    throw new Error("Unexpected challenge from the server.");
  }
  const { evmSignature, solanaSignature } = await withMnemonic(async (m, derivation) => {
    const evm = evmSigner(m, account.index, derivation);
    const sol = solanaSigner(m, account.index);
    if (evm.address !== account.evm || sol.publicKey.toBase58() !== account.solana) throw new Error("Key mismatch");
    return {
      evmSignature: await evm.signMessage(challenge.message),
      solanaSignature: b58encode(ed25519.sign(new TextEncoder().encode(challenge.message), sol.secretKey.slice(0, 32))),
    };
  });
  return post("/identity/bind", { nonce: challenge.nonce, evm_signature: evmSignature, solana_signature: solanaSignature });
}
