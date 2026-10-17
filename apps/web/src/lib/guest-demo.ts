import {
  activateRelayOpsWorkspace,
  createRelayOpsDemoIncident,
  createRelayOpsService,
  listRelayOpsServices,
} from "@/fetchers/relayops";
import createWorkspace from "@/fetchers/workspace/create-workspace";
import getWorkspaces from "@/fetchers/workspace/get-workspaces";
import { authClient } from "@/lib/auth-client";

type GuestDemoCopy = {
  workspaceName: string;
  workspaceDescription: string;
  serviceName: string;
  serviceDescription: string;
  locale: "en-US" | "ru-RU";
};

const DEMO_SERVICE_SLUG = "demo-checkout";

export async function prepareGuestDemo(copy: GuestDemoCopy) {
  let session = await authClient.getSession({
    query: { disableCookieCache: true },
  });
  if (session.error) throw new Error(session.error.message);

  // Keep the anonymous identity across retries after a partially saved setup.
  if (!session.data?.user.isAnonymous) {
    const result = await authClient.signIn.anonymous();
    if (result.error) throw new Error(result.error.message);
    session = await authClient.getSession({
      query: { disableCookieCache: true },
    });
  }
  if (session.error) throw new Error(session.error.message);
  const user = session.data?.user;
  if (!user?.isAnonymous) throw new Error("Guest session unavailable");

  // Character codes retain case distinctions in Better Auth's opaque user IDs.
  // The slug is a retry key; membership from the API remains the access check.
  const workspaceSlug = `demo-${Array.from(user.id, (character) =>
    character.charCodeAt(0).toString(16),
  ).join("")}`;
  let workspace = (await getWorkspaces()).find(
    (item) => item.slug === workspaceSlug,
  );
  if (!workspace) {
    try {
      workspace = await createWorkspace({
        name: copy.workspaceName,
        description: copy.workspaceDescription,
        slug: workspaceSlug,
      });
    } catch (error) {
      // A response can be lost after commit, or another tab can finish first.
      workspace = (await getWorkspaces()).find(
        (item) => item.slug === workspaceSlug,
      );
      if (!workspace) throw error;
    }
  }
  if (!workspace) throw new Error("Guest workspace unavailable");

  const active = await authClient.organization.setActive({
    organizationId: workspace.id,
  });
  if (active.error) throw new Error(active.error.message);
  await activateRelayOpsWorkspace(workspace.id);

  let service = (
    await listRelayOpsServices(workspace.id, { status: "all" })
  ).find((item) => item.slug === DEMO_SERVICE_SLUG);
  if (!service) {
    try {
      service = await createRelayOpsService(workspace.id, {
        name: copy.serviceName,
        description: copy.serviceDescription,
        slug: DEMO_SERVICE_SLUG,
        tier: "critical",
        health: "degraded",
      });
    } catch (error) {
      service = (
        await listRelayOpsServices(workspace.id, { status: "all" })
      ).find((item) => item.slug === DEMO_SERVICE_SLUG);
      if (!service) throw error;
    }
  }
  if (service.archivedAt) {
    return { workspaceId: workspace.id, incidentId: null };
  }
  // This existing endpoint creates a marked DEMO incident with a deterministic
  // idempotency key. Retrying never resets the guest's changes to that incident.
  const detail = await createRelayOpsDemoIncident(
    workspace.id,
    service.id,
    copy.locale,
  );
  return { workspaceId: workspace.id, incidentId: detail.incident.id };
}
