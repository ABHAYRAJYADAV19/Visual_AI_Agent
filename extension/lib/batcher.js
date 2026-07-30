/**
 * Visual Activity Agent — Event Batcher
 *
 * Batches captured events in memory and flushes them to the background
 * service worker on one of two triggers:
 * 1. Time-based: every FLUSH_INTERVAL_MS milliseconds
 * 2. Size-based: when batch reaches MAX_BATCH_SIZE events
 *
 * The batcher is designed to be testable outside the browser environment
 * by accepting a flush callback.
 */

// =============================================================================
// Configuration
// =============================================================================

/** Maximum number of events before auto-flush */
const MAX_BATCH_SIZE = 50;

/** Milliseconds between time-based flushes */
const FLUSH_INTERVAL_MS = 10_000; // 10 seconds

// =============================================================================
// Batcher Class
// =============================================================================

export class EventBatcher {
  /**
   * Create a new EventBatcher.
   *
   * @param {object} options
   * @param {function} options.onFlush - Callback invoked with the batch array
   *   when a flush is triggered. Must accept an array of events.
   * @param {number} [options.maxBatchSize=50] - Max events before auto-flush.
   * @param {number} [options.flushIntervalMs=10000] - Ms between timed flushes.
   */
  constructor(options = {}) {
    this.onFlush = options.onFlush || (() => {});
    this.maxBatchSize = options.maxBatchSize || MAX_BATCH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs || FLUSH_INTERVAL_MS;

    /** @type {Array<object>} */
    this._batch = [];

    /** @type {number|null} */
    this._intervalId = null;

    /** @type {boolean} */
    this._running = false;
  }

  /**
   * Start the timed flush interval.
   */
  start() {
    if (this._running) return;
    this._running = true;

    this._intervalId = setInterval(() => {
      if (this._batch.length > 0) {
        this.flush();
      }
    }, this.flushIntervalMs);
  }

  /**
   * Stop the timed flush interval and flush remaining events.
   */
  stop() {
    this._running = false;
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }

    // Flush remaining events
    if (this._batch.length > 0) {
      this.flush();
    }
  }

  /**
   * Add an event to the batch.
   * Triggers an immediate flush if the batch size limit is reached.
   *
   * @param {object} event - The event object to add
   */
  add(event) {
    this._batch.push({
      ...event,
      batchedAt: Date.now(),
    });

    // Size-based flush
    if (this._batch.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  /**
   * Immediately flush all batched events.
   * Calls the onFlush callback with the current batch and clears it.
   */
  flush() {
    if (this._batch.length === 0) return;

    const eventsToFlush = [...this._batch];
    this._batch = [];

    try {
      this.onFlush(eventsToFlush);
    } catch (error) {
      // If flush fails, put events back (best-effort)
      console.error("[VAI] Batcher flush error:", error);
      this._batch = [...eventsToFlush, ...this._batch];
    }
  }

  /**
   * Get the current number of events in the batch.
   * @returns {number}
   */
  get size() {
    return this._batch.length;
  }

  /**
   * Check if the batcher is currently running.
   * @returns {boolean}
   */
  get isRunning() {
    return this._running;
  }
}
