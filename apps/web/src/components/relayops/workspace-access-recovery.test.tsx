import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessRecovery } from "./workspace-access-recovery";

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: mocks.signOut },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("workspace access recovery", () => {
  it("links to authoritative own-workspace resolution without the foreign ID", () => {
    render(<WorkspaceAccessRecovery />);
    expect(
      screen.getByRole("link", { name: "relayops:access.ownWorkspace" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("relayops:access.explanation")).toBeInTheDocument();
  });

  it("keeps the recovery actions available when switching account fails", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "Unavailable" } });
    render(<WorkspaceAccessRecovery />);

    fireEvent.click(
      screen.getByRole("button", { name: "relayops:access.signIn" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "relayops:access.signOutError",
      ),
    );
    expect(
      screen.getByRole("button", { name: "relayops:access.signIn" }),
    ).toBeEnabled();
  });
});
