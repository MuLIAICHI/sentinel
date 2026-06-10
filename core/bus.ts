/**
 * Typed event bus — a thin wrapper over node:events.
 *
 * Every module communicates exclusively through this bus (and the DB). Wave 2
 * modules never import each other; they emit and subscribe BotEvents here.
 */

import { EventEmitter } from 'node:events';
import type { BotEvent } from './types.js';
import { createLogger } from './logger.js';

/** Internal channel name used to fan every event out to onAny subscribers. */
const ANY = '*';

const log = createLogger('core/bus');

/** Payload type for a given BotEvent type tag. */
export type PayloadOf<T extends BotEvent['type']> = Extract<BotEvent, { type: T }>['payload'];

export class Bus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Many modules subscribe (api, db, orchestrator, positions...). Raise the
    // default-10 listener warning ceiling to a deliberate, still-finite bound.
    this.emitter.setMaxListeners(100);
  }

  /** Emit a BotEvent to all subscribers of its type, and to onAny subscribers. */
  emit(event: BotEvent): void {
    this.emitter.emit(event.type, event.payload);
    this.emitter.emit(ANY, event);
  }

  /**
   * Subscribe to a single event type. The handler receives the payload narrowed
   * to that type. A throwing handler is logged and isolated — it never prevents
   * other handlers from running.
   */
  on<T extends BotEvent['type']>(type: T, handler: (payload: PayloadOf<T>) => void): void {
    this.emitter.on(type, (payload: PayloadOf<T>) => {
      try {
        handler(payload);
      } catch (err) {
        log.error('event handler threw', { eventType: type, error: String(err) });
      }
    });
  }

  /** Subscribe to every event (used by api/ to forward and db/ to persist). */
  onAny(handler: (event: BotEvent) => void): void {
    this.emitter.on(ANY, (event: BotEvent) => {
      try {
        handler(event);
      } catch (err) {
        log.error('onAny handler threw', { eventType: event.type, error: String(err) });
      }
    });
  }
}

/** Process-wide singleton bus. Modules import this rather than constructing their own. */
export const bus = new Bus();
