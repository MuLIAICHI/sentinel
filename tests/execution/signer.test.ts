/**
 * Signer isolation tests. THROWAWAY generated keys only — never a real key.
 *
 * Fresh module state per test via vi.resetModules() + dynamic import, because
 * the signer is a lazy singleton with module-level state.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import bs58 from 'bs58';

const throwaway = Keypair.generate();
const encodedSecret = bs58.encode(throwaway.secretKey);

async function freshSignerModule(): Promise<typeof import('../../execution/signer.js')> {
  return import('../../execution/signer.js');
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('getSigner with SOLANA_PRIVATE_KEY set (throwaway key)', () => {
  it('derives the matching public key', async () => {
    vi.stubEnv('SOLANA_PRIVATE_KEY', encodedSecret);
    const { getSigner } = await freshSignerModule();
    expect(getSigner().publicKey()).toBe(throwaway.publicKey.toBase58());
  });

  it('is a singleton and reads the env exactly once', async () => {
    vi.stubEnv('SOLANA_PRIVATE_KEY', encodedSecret);
    const { getSigner } = await freshSignerModule();
    const first = getSigner();
    // Remove the var: a second call must NOT re-read the env.
    vi.unstubAllEnvs();
    const second = getSigner();
    expect(second).toBe(first);
    expect(second.publicKey()).toBe(throwaway.publicKey.toBase58());
  });

  it('signAndSend signs the bytes and submits via the given connection', async () => {
    vi.stubEnv('SOLANA_PRIVATE_KEY', encodedSecret);
    const { getSigner } = await freshSignerModule();

    const message = new TransactionMessage({
      payerKey: throwaway.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
      instructions: [
        SystemProgram.transfer({
          fromPubkey: throwaway.publicKey,
          toPubkey: Keypair.generate().publicKey,
          lamports: 1,
        }),
      ],
    }).compileToV0Message();
    const unsigned = new VersionedTransaction(message);

    const sendTransaction = vi.fn().mockResolvedValue('test-signature');
    const connection = { sendTransaction } as unknown as Connection;

    const signature = await getSigner().signAndSend(unsigned.serialize(), connection);
    expect(signature).toBe('test-signature');
    expect(sendTransaction).toHaveBeenCalledTimes(1);

    // The submitted transaction must actually carry a non-empty signature.
    const submitted = sendTransaction.mock.calls[0]![0] as VersionedTransaction;
    expect(submitted.signatures).toHaveLength(1);
    expect(submitted.signatures[0]!.some((byte) => byte !== 0)).toBe(true);
  });
});

describe('lazy env read (paper mode must run without the var)', () => {
  it('imports cleanly with SOLANA_PRIVATE_KEY unset', async () => {
    vi.stubEnv('SOLANA_PRIVATE_KEY', '');
    await expect(freshSignerModule()).resolves.toBeDefined();
  });

  it('throws the named-var error only when getSigner() is CALLED', async () => {
    vi.stubEnv('SOLANA_PRIVATE_KEY', '');
    const { getSigner } = await freshSignerModule();
    expect(() => getSigner()).toThrow(/SOLANA_PRIVATE_KEY/);
  });
});

describe('isolation: the Keypair never leaves the module', () => {
  it('the module exports ONLY getSigner', async () => {
    const mod = await freshSignerModule();
    expect(Object.keys(mod).sort()).toEqual(['getSigner']);
  });

  it('the signer surface is exactly {publicKey, signAndSend} — no key material', async () => {
    vi.stubEnv('SOLANA_PRIVATE_KEY', encodedSecret);
    const { getSigner } = await freshSignerModule();
    const signer = getSigner();
    expect(Object.keys(signer).sort()).toEqual(['publicKey', 'signAndSend']);
    // Nothing enumerable on the signer is a Keypair or secret-key buffer.
    for (const value of Object.values(signer)) {
      expect(typeof value).toBe('function');
    }
    expect(JSON.stringify(signer)).not.toContain(encodedSecret);
  });
});
