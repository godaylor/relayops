import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareGuestDemo } from "./guest-demo";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  signIn: vi.fn(),
  setActive: vi.fn(),
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  activate: vi.fn(),
  listServices: vi.fn(),
  createService: vi.fn(),
  createDemo: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    getSession: mocks.session,
    signIn: { anonymous: mocks.signIn },
    organization: { setActive: mocks.setActive },
  },
}));
vi.mock("@/fetchers/workspace/get-workspaces", () => ({
  default: mocks.listWorkspaces,
}));
vi.mock("@/fetchers/workspace/create-workspace", () => ({
  default: mocks.createWorkspace,
}));
vi.mock("@/fetchers/relayops", () => ({
  activateRelayOpsWorkspace: mocks.activate,
  listRelayOpsServices: mocks.listServices,
  createRelayOpsService: mocks.createService,
  createRelayOpsDemoIncident: mocks.createDemo,
}));

const copy = {
  workspaceName: "Demo shift",
  workspaceDescription: "Private training workspace",
  serviceName: "Demo checkout",
  serviceDescription: "Training service",
  locale: "en-US" as const,
};
const guest = { data: { user: { id: "Guest-1", isAnonymous: true } } };
const workspace = { id: "own-workspace", slug: "demo-47756573742d31" };
const service = { id: "demo-service", slug: "demo-checkout" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue(guest);
  mocks.signIn.mockResolvedValue({ data: {}, error: null });
  mocks.setActive.mockResolvedValue({ data: {}, error: null });
  mocks.listWorkspaces.mockResolvedValue([]);
  mocks.createWorkspace.mockResolvedValue(workspace);
  mocks.listServices.mockResolvedValue([]);
  mocks.createService.mockResolvedValue(service);
  mocks.createDemo.mockResolvedValue({ incident: { id: "demo-incident" } });
});

describe("guest demo setup", () => {
  it("creates a private workspace through authorized APIs for a new guest", async () => {
    mocks.session.mockResolvedValueOnce({ data: null });

    await expect(prepareGuestDemo(copy)).resolves.toEqual({
      workspaceId: workspace.id,
      incidentId: "demo-incident",
    });
    expect(mocks.signIn).toHaveBeenCalledOnce();
    expect(mocks.createWorkspace).toHaveBeenCalledWith({
      name: copy.workspaceName,
      description: copy.workspaceDescription,
      slug: workspace.slug,
    });
    expect(mocks.setActive).toHaveBeenCalledWith({
      organizationId: workspace.id,
    });
    expect(mocks.createDemo).toHaveBeenCalledWith(
      workspace.id,
      service.id,
      "en-US",
    );
  });

  it("reuses the existing guest, workspace and service on retry", async () => {
    mocks.listWorkspaces.mockResolvedValue([workspace]);
    mocks.listServices.mockResolvedValue([service]);

    await prepareGuestDemo(copy);

    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.createWorkspace).not.toHaveBeenCalled();
    expect(mocks.createService).not.toHaveBeenCalled();
    expect(mocks.createDemo).toHaveBeenCalledWith(
      workspace.id,
      service.id,
      "en-US",
    );
  });

  it("recovers a workspace and service saved before their responses were lost", async () => {
    mocks.createWorkspace.mockRejectedValue(new Error("Network interrupted"));
    mocks.listWorkspaces
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([workspace]);
    mocks.createService.mockRejectedValue(new Error("Network interrupted"));
    mocks.listServices
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([service]);

    await expect(prepareGuestDemo(copy)).resolves.toEqual({
      workspaceId: workspace.id,
      incidentId: "demo-incident",
    });
    expect(mocks.createWorkspace).toHaveBeenCalledOnce();
    expect(mocks.createService).toHaveBeenCalledOnce();
  });

  it("keeps the same server records after incident setup fails", async () => {
    mocks.createDemo.mockRejectedValueOnce(new Error("Unavailable"));
    await expect(prepareGuestDemo(copy)).rejects.toThrow("Unavailable");
    mocks.listWorkspaces.mockResolvedValue([workspace]);
    mocks.listServices.mockResolvedValue([service]);

    await prepareGuestDemo(copy);

    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.createWorkspace).toHaveBeenCalledOnce();
    expect(mocks.createService).toHaveBeenCalledOnce();
    expect(mocks.createDemo).toHaveBeenCalledTimes(2);
  });

  it("does not activate or seed a workspace when access resolution fails", async () => {
    mocks.createWorkspace.mockRejectedValue(new Error("Workspace denied"));

    await expect(prepareGuestDemo(copy)).rejects.toThrow("Workspace denied");
    expect(mocks.setActive).not.toHaveBeenCalled();
    expect(mocks.createDemo).not.toHaveBeenCalled();
  });

  it("does not use an authenticated account if anonymous sign-in fails", async () => {
    mocks.session.mockResolvedValue({
      data: { user: { id: "owner", isAnonymous: false } },
    });
    mocks.signIn.mockResolvedValue({ error: { message: "Guest disabled" } });

    await expect(prepareGuestDemo(copy)).rejects.toThrow("Guest disabled");
    expect(mocks.listWorkspaces).not.toHaveBeenCalled();
    expect(mocks.createDemo).not.toHaveBeenCalled();
  });

  it("opens the saved workspace without undoing an archived demo service", async () => {
    mocks.listWorkspaces.mockResolvedValue([workspace]);
    mocks.listServices.mockResolvedValue([
      { ...service, archivedAt: "2026-10-17T10:00:00Z" },
    ]);

    await expect(prepareGuestDemo(copy)).resolves.toEqual({
      workspaceId: workspace.id,
      incidentId: null,
    });
    expect(mocks.createService).not.toHaveBeenCalled();
    expect(mocks.createDemo).not.toHaveBeenCalled();
  });
});
