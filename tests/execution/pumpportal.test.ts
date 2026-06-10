import { describe, expect, it } from 'vitest';
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  ALLOWED_PROGRAM_IDS,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  PUMP_FUN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  buildTradeRequest,
  verifyTransaction,
} from '../../execution/pumpportal.js';

// Throwaway keys only — never a real key in tests (hard rule).
const payer = Keypair.generate();
const stranger = Keypair.generate();
const recipient = Keypair.generate();
// Any valid 32-byte base58 string works as a fixture blockhash.
const blockhash = Keypair.generate().publicKey.toBase58();

function buildTx(payerKey: PublicKey, instructions: TransactionInstruction[]): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

const transferIx = SystemProgram.transfer({
  fromPubkey: payer.publicKey,
  toPubkey: recipient.publicKey,
  lamports: 1_000,
});
const computeIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 });

describe('buildTradeRequest', () => {
  it("buy: denominatedInSol is the STRING 'true' (PumpPortal wire format)", () => {
    const request = buildTradeRequest('PUBKEY', 'buy', 'MINT', 0.033, {
      slippage: 5,
      priorityFee: 0.001,
      pool: 'pump',
    });
    expect(request).toEqual({
      publicKey: 'PUBKEY',
      action: 'buy',
      mint: 'MINT',
      amount: 0.033,
      denominatedInSol: 'true',
      slippage: 5,
      priorityFee: 0.001,
      pool: 'pump',
    });
    expect(typeof request.denominatedInSol).toBe('string');
  });

  it("sell: denominatedInSol is the STRING 'false' and amount may be tokens or 'N%'", () => {
    const request = buildTradeRequest('PUBKEY', 'sell', 'MINT', '50%');
    expect(request.action).toBe('sell');
    expect(request.denominatedInSol).toBe('false');
    expect(request.amount).toBe('50%');
  });

  it('applies upstream-compatible defaults (slippage 10, priorityFee 0.0005, pool pump)', () => {
    const request = buildTradeRequest('PUBKEY', 'buy', 'MINT', 1);
    expect(request.slippage).toBe(10);
    expect(request.priorityFee).toBe(0.0005);
    expect(request.pool).toBe('pump');
  });
});

describe('program-id allowlist constants', () => {
  it('every allowlist entry is a structurally valid public key', () => {
    for (const id of ALLOWED_PROGRAM_IDS) {
      expect(() => new PublicKey(id)).not.toThrow();
    }
  });

  it('contains exactly the five audited programs', () => {
    expect([...ALLOWED_PROGRAM_IDS].sort()).toEqual(
      [
        PUMP_FUN_PROGRAM_ID,
        SYSTEM_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        COMPUTE_BUDGET_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ].sort(),
    );
    // Sanity-pin the well-known runtime ids against web3.js's own constants.
    expect(SYSTEM_PROGRAM_ID).toBe(SystemProgram.programId.toBase58());
    expect(COMPUTE_BUDGET_PROGRAM_ID).toBe(ComputeBudgetProgram.programId.toBase58());
  });
});

describe('verifyTransaction', () => {
  it('accepts: our fee payer, all programs in the allowlist', () => {
    const tx = buildTx(payer.publicKey, [computeIx, transferIx]);
    expect(verifyTransaction(tx, payer.publicKey.toBase58())).toBe(true);
  });

  it('rejects: fee payer is not our public key', () => {
    const tx = buildTx(stranger.publicKey, [transferIx]);
    expect(verifyTransaction(tx, payer.publicKey.toBase58())).toBe(false);
  });

  it('rejects: an instruction targets a program outside the allowlist', () => {
    const rogueProgram = Keypair.generate().publicKey;
    const rogueIx = new TransactionInstruction({
      programId: rogueProgram,
      keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }],
      data: Buffer.alloc(0),
    });
    // Even alongside perfectly normal instructions, one rogue program kills it.
    const tx = buildTx(payer.publicKey, [computeIx, transferIx, rogueIx]);
    expect(verifyTransaction(tx, payer.publicKey.toBase58())).toBe(false);
  });

  it('rejects: allowed program missing from a caller-narrowed allowlist', () => {
    const tx = buildTx(payer.publicKey, [transferIx]); // system program
    const noSystem = new Set([PUMP_FUN_PROGRAM_ID]);
    expect(verifyTransaction(tx, payer.publicKey.toBase58(), noSystem)).toBe(false);
  });

  it('round-trips through serialize/deserialize (the live-path shape)', () => {
    const tx = buildTx(payer.publicKey, [computeIx, transferIx]);
    const revived = VersionedTransaction.deserialize(tx.serialize());
    expect(verifyTransaction(revived, payer.publicKey.toBase58())).toBe(true);
    expect(verifyTransaction(revived, stranger.publicKey.toBase58())).toBe(false);
  });
});
