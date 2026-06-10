import { describe, expect, it } from 'vitest';
import { DECISION_SCHEMA, validateModelOutput } from '../../decision/schema.js';

describe('DECISION_SCHEMA', () => {
  it('matches the Decision contract minus mint/modelLatencyMs', () => {
    expect(Object.keys(DECISION_SCHEMA.properties)).toEqual([
      'action',
      'confidence',
      'reasoning',
    ]);
    expect(DECISION_SCHEMA.required).toEqual(['action', 'confidence', 'reasoning']);
    expect(DECISION_SCHEMA.additionalProperties).toBe(false);
    expect(DECISION_SCHEMA.properties.action.enum).toEqual(['BUY', 'SKIP']);
  });
});

describe('validateModelOutput — accepts', () => {
  it('a clean JSON string', () => {
    const out = validateModelOutput('{"action":"BUY","confidence":0.8,"reasoning":"momentum"}');
    expect(out).toEqual({ action: 'BUY', confidence: 0.8, reasoning: 'momentum' });
  });

  it('an already-parsed object', () => {
    const out = validateModelOutput({ action: 'SKIP', confidence: 0.2, reasoning: 'dead volume' });
    expect(out).toEqual({ action: 'SKIP', confidence: 0.2, reasoning: 'dead volume' });
  });

  it('fenced JSON with a ```json fence stripped', () => {
    const out = validateModelOutput(
      '```json\n{"action":"SKIP","confidence":0.1,"reasoning":"dev dumped"}\n```',
    );
    expect(out).toEqual({ action: 'SKIP', confidence: 0.1, reasoning: 'dev dumped' });
  });

  it('fenced JSON with a bare ``` fence stripped', () => {
    const out = validateModelOutput('```\n{"action":"BUY","confidence":1,"reasoning":"all green"}\n```');
    expect(out).toEqual({ action: 'BUY', confidence: 1, reasoning: 'all green' });
  });

  it('boundary confidences 0 and 1', () => {
    expect(validateModelOutput({ action: 'SKIP', confidence: 0, reasoning: 'x' })?.confidence).toBe(0);
    expect(validateModelOutput({ action: 'BUY', confidence: 1, reasoning: 'x' })?.confidence).toBe(1);
  });
});

describe('validateModelOutput — rejects with null', () => {
  it('a wrong action enum', () => {
    expect(validateModelOutput('{"action":"HOLD","confidence":0.5,"reasoning":"x"}')).toBeNull();
  });

  it('confidence above 1', () => {
    expect(validateModelOutput('{"action":"BUY","confidence":1.5,"reasoning":"x"}')).toBeNull();
  });

  it('negative confidence', () => {
    expect(validateModelOutput('{"action":"BUY","confidence":-0.1,"reasoning":"x"}')).toBeNull();
  });

  it('non-numeric or non-finite confidence', () => {
    expect(validateModelOutput('{"action":"BUY","confidence":"high","reasoning":"x"}')).toBeNull();
    expect(validateModelOutput({ action: 'BUY', confidence: Number.NaN, reasoning: 'x' })).toBeNull();
  });

  it('a missing field', () => {
    expect(validateModelOutput('{"action":"BUY","confidence":0.5}')).toBeNull();
    expect(validateModelOutput('{"confidence":0.5,"reasoning":"x"}')).toBeNull();
  });

  it('an empty reasoning string', () => {
    expect(validateModelOutput('{"action":"SKIP","confidence":0.5,"reasoning":"  "}')).toBeNull();
  });

  it('non-JSON text', () => {
    expect(validateModelOutput('I cannot evaluate this token.')).toBeNull();
  });

  it('JSON that is not an object', () => {
    expect(validateModelOutput('"BUY"')).toBeNull();
    expect(validateModelOutput('[1,2,3]')).toBeNull();
    expect(validateModelOutput('null')).toBeNull();
  });

  it('null/undefined input', () => {
    expect(validateModelOutput(null)).toBeNull();
    expect(validateModelOutput(undefined)).toBeNull();
  });
});
