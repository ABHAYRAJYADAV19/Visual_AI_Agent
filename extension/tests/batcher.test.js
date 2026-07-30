/**
 * Visual Activity Agent — Event Batcher Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventBatcher } from "../lib/batcher.js";

describe("EventBatcher", () => {
  let batcher;
  let flushedBatches;

  beforeEach(() => {
    vi.useFakeTimers();
    flushedBatches = [];
    batcher = new EventBatcher({
      onFlush: (events) => flushedBatches.push([...events]),
      maxBatchSize: 5,
      flushIntervalMs: 1000,
    });
  });

  afterEach(() => {
    batcher.stop();
    vi.useRealTimers();
  });

  // --- Basic functionality ---

  it("starts with empty batch", () => {
    expect(batcher.size).toBe(0);
  });

  it("adds events to the batch", () => {
    batcher.add({ type: "click", x: 100, y: 200 });
    expect(batcher.size).toBe(1);
  });

  it("adds batchedAt timestamp to events", () => {
    const now = Date.now();
    batcher.add({ type: "click" });
    batcher.flush();
    expect(flushedBatches[0][0].batchedAt).toBeGreaterThanOrEqual(now);
  });

  // --- Size-based flush ---

  it("auto-flushes when batch reaches maxBatchSize", () => {
    for (let i = 0; i < 5; i++) {
      batcher.add({ type: "click", index: i });
    }

    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0].length).toBe(5);
    expect(batcher.size).toBe(0);
  });

  it("does not auto-flush before reaching maxBatchSize", () => {
    for (let i = 0; i < 4; i++) {
      batcher.add({ type: "click", index: i });
    }

    expect(flushedBatches.length).toBe(0);
    expect(batcher.size).toBe(4);
  });

  it("handles multiple size-based flushes", () => {
    for (let i = 0; i < 12; i++) {
      batcher.add({ type: "click", index: i });
    }

    // 12 events with maxBatchSize=5 → 2 auto-flushes + 2 remaining
    expect(flushedBatches.length).toBe(2);
    expect(flushedBatches[0].length).toBe(5);
    expect(flushedBatches[1].length).toBe(5);
    expect(batcher.size).toBe(2);
  });

  // --- Time-based flush ---

  it("flushes on timer interval when running", () => {
    batcher.start();

    batcher.add({ type: "click" });
    batcher.add({ type: "scroll" });

    expect(flushedBatches.length).toBe(0);

    // Advance timer past the flush interval
    vi.advanceTimersByTime(1000);

    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0].length).toBe(2);
    expect(batcher.size).toBe(0);
  });

  it("does not flush on timer if batch is empty", () => {
    batcher.start();
    vi.advanceTimersByTime(5000);

    expect(flushedBatches.length).toBe(0);
  });

  it("flushes multiple times on repeated intervals", () => {
    batcher.start();

    batcher.add({ type: "click" });
    vi.advanceTimersByTime(1000);

    batcher.add({ type: "scroll" });
    vi.advanceTimersByTime(1000);

    expect(flushedBatches.length).toBe(2);
  });

  // --- Manual flush ---

  it("manually flushes all events", () => {
    batcher.add({ type: "click" });
    batcher.add({ type: "scroll" });
    batcher.add({ type: "nav" });

    batcher.flush();

    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0].length).toBe(3);
    expect(batcher.size).toBe(0);
  });

  it("manual flush with empty batch does nothing", () => {
    batcher.flush();
    expect(flushedBatches.length).toBe(0);
  });

  // --- Start/Stop ---

  it("reports running state correctly", () => {
    expect(batcher.isRunning).toBe(false);
    batcher.start();
    expect(batcher.isRunning).toBe(true);
    batcher.stop();
    expect(batcher.isRunning).toBe(false);
  });

  it("stop flushes remaining events", () => {
    batcher.start();
    batcher.add({ type: "click" });
    batcher.add({ type: "scroll" });

    batcher.stop();

    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0].length).toBe(2);
  });

  it("does not double-start", () => {
    batcher.start();
    batcher.start(); // Should be no-op
    expect(batcher.isRunning).toBe(true);
  });

  // --- Error handling ---

  it("recovers events on flush callback error", () => {
    const errorBatcher = new EventBatcher({
      onFlush: () => {
        throw new Error("Network error");
      },
      maxBatchSize: 100,
    });

    errorBatcher.add({ type: "click" });
    errorBatcher.add({ type: "scroll" });

    // Flush should throw but recover
    errorBatcher.flush();

    // Events should still be in the batch
    expect(errorBatcher.size).toBe(2);
  });
});
