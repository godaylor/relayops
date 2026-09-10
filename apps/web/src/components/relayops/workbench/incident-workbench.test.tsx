import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RelayOpsIncidentDetail } from "@/fetchers/relayops";
import { parseWorkbenchSearch } from "@/lib/relayops-workbench-search";
import { IncidentWorkbench } from "./incident-workbench";
import { workbenchItem, workbenchLabels } from "./test-fixtures";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <a {...props}>{children}</a>,
}));

vi.mock("@/components/relayops/incident-detail-panel", () => ({
  IncidentDetailPanel: ({
    headingRef,
  }: {
    headingRef?: RefObject<HTMLHeadingElement | null>;
  }) => (
    <h2 ref={headingRef} tabIndex={-1}>
      Inspector detail
    </h2>
  ),
}));

afterEach(cleanup);

const now = new Date("2026-08-28T12:00:00.000Z");
const page = {
  items: [workbenchItem(0)],
  nextCursor: null,
  facets: {
    status: [{ value: "detected", label: "Detected", count: 1 }],
    severity: [{ value: "sev1", label: "SEV1", count: 1 }],
    service: [{ value: "service-1", label: "Checkout", count: 1 }],
    commander: [{ value: "user-1", label: "Ada", count: 1 }],
  },
  groups: [],
};

describe("IncidentWorkbench inspector", () => {
  it("localizes enum facets and groups without changing canonical URL values", () => {
    const labels = {
      ...workbenchLabels,
      statusById: { ...workbenchLabels.statusById, detected: "Обнаружен" },
    };
    render(
      <IncidentWorkbench
        workspaceId="workspace-1"
        labels={labels}
        state="ready"
        search={parseWorkbenchSearch({ group: "status" }, now)}
        page={{
          ...page,
          groups: [{ value: "detected", label: "detected", count: 1 }],
          facets: {
            ...page.facets,
            status: [{ value: "detected", label: "detected", count: 1 }],
          },
        }}
        onSearchChange={vi.fn()}
        onSelectIncident={vi.fn()}
      />,
    );
    expect(screen.getByRole("option", { name: "Обнаружен (1)" })).toHaveValue(
      "detected",
    );
    expect(screen.getByText("Обнаружен · 1")).toBeInTheDocument();
  });
  it("opens from keyboard, focuses detail, and restores the originating row", async () => {
    const onSelectIncident = vi.fn();
    const search = parseWorkbenchSearch({}, now);
    const commonProps = {
      workspaceId: "workspace-1",
      labels: workbenchLabels,
      state: "ready" as const,
      page,
      onSearchChange: vi.fn(),
      onSelectIncident,
    };
    const { rerender } = render(
      <IncidentWorkbench {...commonProps} search={search} />,
    );

    const row = screen.getByTestId("workbench-row");
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelectIncident).toHaveBeenCalledWith("incident-0");

    rerender(
      <IncidentWorkbench
        {...commonProps}
        search={{ ...search, incidentId: "incident-0" }}
        selectedDetail={
          {
            incident: { id: "incident-0" },
          } as RelayOpsIncidentDetail
        }
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Inspector detail")).toHaveFocus(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(onSelectIncident).toHaveBeenLastCalledWith(undefined);
    await waitFor(() => expect(row).toHaveFocus());
  });

  it("distinguishes filtered-empty and saved-view conflict states", () => {
    const search = parseWorkbenchSearch({ q: "no match" }, now);
    render(
      <IncidentWorkbench
        workspaceId="workspace-1"
        search={search}
        labels={workbenchLabels}
        state="ready"
        page={{ ...page, items: [] }}
        savedViewConflict={{
          draftName: "Active",
          expectedVersion: 2,
          current: {
            id: "view-1",
            workspaceId: "workspace-1",
            ownerUserId: "user-1",
            name: "Active shared",
            visibility: "workspace",
            schemaVersion: 1,
            definition: {
              q: "",
              status: ["detected"],
              severity: [],
              service: [],
              commander: [],
              from: "2026-08-01",
              to: "2026-08-28",
              sort: [{ field: "severity", direction: "desc" }],
              group: "none",
              density: "compact",
              columns: search.columns,
            },
            version: 3,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        }}
        onSearchChange={vi.fn()}
        onSelectIncident={vi.fn()}
      />,
    );
    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Active shared · v3");
  });
});
