import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultThresholds, optionalEnv, requireEnv } from '../../core/config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('defaultThresholds', () => {
  it('matches the SPEC filter defaults', () => {
    expect(defaultThresholds.minAgeSeconds).toBe(1200); // ~20 min
    expect(defaultThresholds.curveMinPct).toBe(55);
    expect(defaultThresholds.curveMaxPct).toBe(85);
    expect(defaultThresholds.top10MaxPct).toBe(25);
    expect(defaultThresholds.devSoldMaxPct).toBe(50);
  });
});

describe('requireEnv', () => {
  it('throws an error that names the missing variable and says to ask the human', () => {
    vi.stubEnv('PUMPPORTAL_WS_URL', '');
    expect(() => requireEnv('PUMPPORTAL_WS_URL')).toThrowError(/PUMPPORTAL_WS_URL/);
    expect(() => requireEnv('PUMPPORTAL_WS_URL')).toThrowError(/ask the human/);
  });

  it('returns the value when set', () => {
    vi.stubEnv('PUMPPORTAL_WS_URL', 'wss://example.invalid/stream');
    expect(requireEnv('PUMPPORTAL_WS_URL')).toBe('wss://example.invalid/stream');
  });
});

describe('optionalEnv', () => {
  it('returns undefined when unset, without throwing', () => {
    vi.stubEnv('MORALIS_API_KEY', '');
    expect(optionalEnv('MORALIS_API_KEY')).toBeUndefined();
  });

  it('returns the value when set', () => {
    vi.stubEnv('MORALIS_API_KEY', 'abc123');
    expect(optionalEnv('MORALIS_API_KEY')).toBe('abc123');
  });
});

describe('hard rule: never touch .env', () => {
  it('config source contains no dotenv usage or file reads', () => {
    const source = readFileSync(new URL('../../core/config.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]dotenv['"]|require\(['"]dotenv['"]\)/);
    expect(source).not.toMatch(/readFile|openSync|createReadStream/);
    expect(source).not.toMatch(/['"]\.env/);
  });
});
