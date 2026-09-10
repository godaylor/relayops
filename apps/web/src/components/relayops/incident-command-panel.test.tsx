import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  RelayOpsApiError,
  type RelayOpsIncidentDetail,
} from "@/fetchers/relayops";
import { relayOpsKeys } from "@/hooks/queries/relayops/use-relayops";
import { i18n } from "@/lib/i18n";
import { IncidentCommandPanel } from "./incident-command-panel";

const publishUpdate = vi.hoisted(() => vi.fn());
const capabilityAllowed = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/relayops/use-relayops-capability", () => ({
  useRelayOpsCapability: (id: string) => ({
    allowed: capabilityAllowed(id),
    isCheckingPermissions: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/fetchers/relayops", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/fetchers/relayops")>();
  return {
    ...actual,
    publishRelayOpsIncidentUpdate: publishUpdate,
  };
});

const detail = {
  incident: {
    id: "incident-1",
    workspaceId: "workspace-1",
    number: 1,
    key: "INC-1",
    title: "Checkout latency",
    summary: "Customer checkouts are slow.",
    status: "triaging",
    severity: "sev2",
    impact: "degraded",
    serviceId: "service-1",
    commanderId: null,
    resolutionSummary: null,
    version: 2,
    createdBy: "user-1",
    detectedAt: "2026-08-28T10:00:00.000Z",
    acknowledgedAt: "2026-08-28T10:01:00.000Z",
    mitigatedAt: null,
    resolvedAt: null,
    dismissedAt: null,
    lastUpdateAt: "2026-08-28T10:01:00.000Z",
    createdAt: "2026-08-28T10:00:00.000Z",
    updatedAt: "2026-08-28T10:01:00.000Z",
    isDemo: false,
  },
  service: {
    id: "service-1",
    workspaceId: "workspace-1",
    slug: "checkout",
    name: "Checkout",
    description: null,
    tier: "critical",
    health: "degraded",
    ownerTeamId: null,
    ownerTeamName: null,
    repositoryUrl: null,
    runbookUrl: null,
    archivedAt: null,
    createdAt: "2026-08-28T09:00:00.000Z",
    updatedAt: "2026-08-28T09:00:00.000Z",
  },
  commander: null,
  responders: [],
  affectedServices: [],
  timeline: [],
} as RelayOpsIncidentDetail;

function withVersion(version: number): RelayOpsIncidentDetail {
  return {
    ...detail,
    incident: {
      ...detail.incident,
      status: "mitigating",
      version,
    },
  };
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  client.setQueryData(
    relayOpsKeys.incident("workspace-1", "incident-1"),
    detail,
  );
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <IncidentCommandPanel workspaceId="workspace-1" detail={detail} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return client;
}

beforeAll(async () => {
  await i18n.changeLanguage("en-US");
  await i18n.loadNamespaces(["relayops"]);
});

beforeEach(() => {
  publishUpdate.mockReset();
  capabilityAllowed.mockReset();
  capabilityAllowed.mockReturnValue(true);
});

afterEach(cleanup);

describe("RelayOps IncidentCommandPanel", () => {
  it("preserves the draft on 409 and reapplies it with the same idempotency key", async () => {
    const current = withVersion(3);
    publishUpdate
      .mockRejectedValueOnce(
        new RelayOpsApiError("Incident changed", 409, {
          code: "version_conflict",
          message: "Incident changed",
          current,
        }),
      )
      .mockResolvedValueOnce(withVersion(4));
    renderPanel();

    const draft = screen.getByLabelText("Durable incident update");
    fireEvent.change(draft, {
      target: { value: "Database failover is in progress." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish update" }));

    expect(
      await screen
        .findByRole("alert", { name: "" })
        .catch(() => screen.findByText("Incident changed")),
    ).toBeTruthy();
    expect(draft).toHaveValue("Database failover is in progress.");

    fireEvent.click(screen.getByRole("button", { name: "Reapply draft" }));
    await waitFor(() => expect(publishUpdate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(draft).toHaveValue(""));

    const firstInput = publishUpdate.mock.calls[0]?.[2];
    const secondInput = publishUpdate.mock.calls[1]?.[2];
    expect(secondInput).toMatchObject({
      expectedVersion: 3,
      idempotencyKey: firstInput.idempotencyKey,
      message: "Database failover is in progress.",
    });
  });

  it("keeps the authoritative cache and draft unchanged on a failed mutation", async () => {
    publishUpdate.mockRejectedValueOnce(
      new RelayOpsApiError("Service unavailable", 503),
    );
    const client = renderPanel();

    const draft = screen.getByLabelText("Durable incident update");
    fireEvent.change(draft, { target: { value: "Draft must survive." } });
    fireEvent.click(screen.getByRole("button", { name: "Publish update" }));

    expect(await screen.findByText("Service unavailable")).toBeInTheDocument();
    expect(draft).toHaveValue("Draft must survive.");
    expect(
      client.getQueryData(relayOpsKeys.incident("workspace-1", "incident-1")),
    ).toEqual(detail);
  });

  it("hides direct action and command entry points when the registry denies them", () => {
    capabilityAllowed.mockReturnValue(false);
    renderPanel();

    expect(screen.queryByText("Transition incident")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Durable incident update"),
    ).not.toBeInTheDocument();
  });
});
