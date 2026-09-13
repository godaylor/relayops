import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../../apps/api/src/database", () => ({
  getDatabase: () => ({ execute }),
}));
vi.mock("../../../apps/api/src/ws", () => ({
  publishUserBroadcast: vi.fn(),
  publishWorkspaceBroadcast: vi.fn(),
}));

describe("outbox scheduling on a free database", () => {
  let worker: typeof import("../../../apps/api/src/relayops/outbox-worker");

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv("RELAYOPS_RESOURCE_PROFILE", "free");
    execute.mockReset().mockResolvedValue({ rows: [] });
    worker = await import("../../../apps/api/src/relayops/outbox-worker");
  });

  afterEach(() => {
    worker.stopRelayOpsOutboxWorker();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("lets an idle database sleep and wakes immediately for a mutation", async () => {
    worker.startRelayOpsOutboxWorker();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(14 * 60_000);
    expect(execute).toHaveBeenCalledTimes(1);
    worker.wakeRelayOpsOutboxWorker();
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("does not lose a wake request arriving during a database query", async () => {
    let finish!: (value: { rows: [] }) => void;
    execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    worker.startRelayOpsOutboxWorker();
    await vi.advanceTimersByTimeAsync(0);
    worker.wakeRelayOpsOutboxWorker();
    finish({ rows: [] });
    await vi.advanceTimersByTimeAsync(250);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("retries database failures promptly instead of sleeping for fifteen minutes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    execute.mockRejectedValueOnce(new Error("temporary connection failure"));
    worker.startRelayOpsOutboxWorker();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("retains polling for the default self-hosted profile and stops cleanly", async () => {
    vi.stubEnv("RELAYOPS_RESOURCE_PROFILE", "");
    worker.startRelayOpsOutboxWorker();
    worker.startRelayOpsOutboxWorker();
    await vi.advanceTimersByTimeAsync(500);
    expect(execute).toHaveBeenCalledTimes(3);
    worker.stopRelayOpsOutboxWorker();
    worker.wakeRelayOpsOutboxWorker();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(execute).toHaveBeenCalledTimes(3);
  });
});
