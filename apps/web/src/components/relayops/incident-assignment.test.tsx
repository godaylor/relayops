import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { RelayOpsIncidentDetail } from "@/fetchers/relayops";
import { i18n } from "@/lib/i18n";
import { IncidentAssignment } from "./incident-assignment";

const assign = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/queries/relayops/use-relayops", () => ({
  useAssignRelayOpsIncidentParticipants: () => ({
    mutateAsync: assign,
    isPending: false,
  }),
}));

vi.mock("@/hooks/queries/workspace-users/use-get-workspace-users", () => ({
  default: () => ({
    isLoading: false,
    data: [{ userId: "responder-1", user: { name: "Alex Rivera" } }],
  }),
}));

beforeAll(async () => {
  await i18n.changeLanguage("en-US");
  await i18n.loadNamespaces(["relayops"]);
});
beforeEach(() => assign.mockReset());
afterEach(cleanup);

function renderAssignment() {
  render(
    <I18nextProvider i18n={i18n}>
      <IncidentAssignment
        workspaceId="workspace-1"
        detail={
          {
            incident: { id: "incident-1", version: 4 },
            commander: null,
          } as RelayOpsIncidentDetail
        }
      />
    </I18nextProvider>,
  );
}

it("keeps saved feedback visible and focus reachable after collapsing assignment", async () => {
  assign.mockResolvedValueOnce({});
  renderAssignment();
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "responder-1" },
  });
  const submit = screen.getByRole("button");
  submit.focus();
  fireEvent.click(submit);

  await waitFor(() =>
    expect(document.querySelector("details")).not.toHaveAttribute("open"),
  );
  await waitFor(() => expect(screen.getByRole("status")).toBeVisible());
  expect(document.querySelector("summary")).toHaveFocus();
  expect(assign).toHaveBeenCalledWith({
    commanderId: "responder-1",
    expectedVersion: 4,
    idempotencyKey: expect.any(String),
  });
});

it("keeps the selected responder and open form after a failed save", async () => {
  assign.mockRejectedValueOnce(new Error("Offline"));
  renderAssignment();
  const select = screen.getByRole("combobox");
  fireEvent.change(select, { target: { value: "responder-1" } });
  fireEvent.click(screen.getByRole("button"));

  await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
  expect(document.querySelector("details")).toHaveAttribute("open");
  expect(select).toHaveValue("responder-1");
});
