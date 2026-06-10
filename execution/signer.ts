/**
 * The signer — THE ONLY FILE IN THE ENTIRE REPO THAT TOUCHES THE PRIVATE KEY.
 *
 * Isolation contract (project hard rule + SPEC §0.2 + ADR-006):
 *   - SOLANA_PRIVATE_KEY is read here and nowhere else, via requireEnv only.
 *   - The read is LAZY and happens ONCE: first getSigner() call. Importing
 *     this module never touches the env, so paper mode runs without the var.
 *   - The Keypair lives inside a closure. It is never exported, never logged,
 *     never serialized, never passed to another module. The vendored
 *     PumpPortal trade path is keypair-free by design (keypair injection per
 *     the audit) — signing happens HERE, on bytes handed to signAndSend.
 *   - The only key-derived value that ever leaves: the PUBLIC key (base58).
 */

import { Keypair, VersionedTransaction } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import { requireEnv } from '../core/config.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('execution/signer');

/** The entire surface other modules may see. No Keypair, ever. */
export interface Signer {
  /** Our public key, base58. Safe to transmit (PumpPortal request body). */
  publicKey(): string;
  /**
   * Deserialize a (verified!) serialized transaction, sign it with the
   * private key, and submit to the given connection. Returns the signature.
   * Callers MUST have run verifyTransaction on these bytes first — this
   * function does not re-check intent, only signs and sends.
   */
  signAndSend(serializedTx: Uint8Array, connection: Connection): Promise<string>;
}

let instance: Signer | undefined;

/**
 * Lazy singleton. The first call reads SOLANA_PRIVATE_KEY (throws a named-var
 * error if missing — ask the human); subsequent calls reuse the same closure
 * and never re-read the env.
 */
export function getSigner(): Signer {
  if (!instance) {
    // The decoded secret and the Keypair are confined to this closure scope.
    const keypair = Keypair.fromSecretKey(bs58.decode(requireEnv('SOLANA_PRIVATE_KEY')));
    const publicKeyBase58 = keypair.publicKey.toBase58();
    log.info('signer initialized', { publicKey: publicKeyBase58 });

    instance = {
      publicKey: () => publicKeyBase58,
      signAndSend: async (serializedTx: Uint8Array, connection: Connection): Promise<string> => {
        const transaction = VersionedTransaction.deserialize(serializedTx);
        transaction.sign([keypair]);
        // Submit to the caller-configured RPC only (requireEnv('SOLANA_RPC_URL')
        // upstream of here) — never a hardcoded public endpoint.
        const signature = await connection.sendTransaction(transaction, {
          skipPreflight: false,
          maxRetries: 3,
        });
        log.info('transaction submitted', { signature });
        return signature;
      },
    };
  }
  return instance;
}
