import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDemoIncident,
  DEMO_DATA_SET_ID,
} from "../../../apps/api/src/relayops/workspace-controllers";

const mocks = vi.hoisted(() => ({ createIncident: vi.fn() }));

vi.mock("../../../apps/api/src/database", () => ({
  default: {},
  schema: {},
}));
vi.mock("../../../apps/api/src/relayops/controllers", () => ({
  createIncident: mocks.createIncident,
}));
vi.mock("../../../apps/api/src/relayops/service-controllers", () => ({
  listServices: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

describe("localized demo incident", () => {
  it("keeps the existing English sample when locale is omitted", async () => {
    await createDemoIncident("workspace", "actor", "service");

    expect(mocks.createIncident).toHaveBeenCalledWith("workspace", "actor", {
      serviceId: "service",
      title: "Checkout latency above error budget",
      summary:
        "Deterministic demo incident. Use it to explore the Incident Room, then remove all demo data from Overview.",
      severity: "sev2",
      impact: "degraded",
      idempotencyKey: `demo:${DEMO_DATA_SET_ID}:service`,
      demoDataSetId: DEMO_DATA_SET_ID,
    });
  });

  it("persists Russian content through the same marked, idempotent incident command", async () => {
    await createDemoIncident("workspace", "actor", "service", "ru-RU");

    expect(mocks.createIncident).toHaveBeenCalledWith(
      "workspace",
      "actor",
      expect.objectContaining({
        title: "Оплата картой проходит с задержкой",
        summary: expect.stringContaining("Учебный инцидент:"),
        idempotencyKey: `demo:${DEMO_DATA_SET_ID}:service`,
        demoDataSetId: DEMO_DATA_SET_ID,
      }),
    );
  });
});
