import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, setLogLevel } from '../../core/logger.js';

let lines: string[];

beforeEach(() => {
  lines = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  setLogLevel('debug');
});

afterEach(() => {
  setLogLevel('info');
  vi.restoreAllMocks();
});

function lastEntry(): Record<string, any> {
  expect(lines.length).toBeGreaterThan(0);
  return JSON.parse(lines[lines.length - 1]!);
}

describe('createLogger', () => {
  it('writes one JSON line with time, level, module, and msg', () => {
    createLogger('test-module').info('hello');
    const entry = lastEntry();
    expect(entry.level).toBe('info');
    expect(entry.module).toBe('test-module');
    expect(entry.msg).toBe('hello');
    expect(typeof entry.time).toBe('string');
    expect(lines[lines.length - 1]!.endsWith('\n')).toBe(true);
  });

  it('redacts fields whose names look secret-bearing', () => {
    createLogger('t').info('connecting', {
      apiKey: 'sk-very-secret',
      ANTHROPIC_API_KEY: 'sk-ant-xyz',
      authToken: 'tok',
      privateKeyPath: '/somewhere',
      mint: 'MintAAA',
    });
    const raw = lines[lines.length - 1]!;
    expect(raw).not.toContain('sk-very-secret');
    expect(raw).not.toContain('sk-ant-xyz');
    const entry = lastEntry();
    expect(entry.fields.apiKey).toBe('[REDACTED]');
    expect(entry.fields.ANTHROPIC_API_KEY).toBe('[REDACTED]');
    expect(entry.fields.authToken).toBe('[REDACTED]');
    expect(entry.fields.privateKeyPath).toBe('[REDACTED]');
    expect(entry.fields.mint).toBe('MintAAA');
  });

  it('redacts nested objects recursively', () => {
    createLogger('t').info('nested', { provider: { name: 'helius', secretKey: 'shh' } });
    const raw = lines[lines.length - 1]!;
    expect(raw).not.toContain('shh');
    expect(lastEntry().fields.provider.secretKey).toBe('[REDACTED]');
  });

  it('suppresses levels below the configured minimum', () => {
    setLogLevel('info');
    createLogger('t').debug('invisible');
    expect(lines).toHaveLength(0);
  });

  it('does not throw on circular field values', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(() => createLogger('t').info('circular', circular)).not.toThrow();
    expect(lastEntry().fields.self).toBe('[CIRCULAR]');
  });
});
