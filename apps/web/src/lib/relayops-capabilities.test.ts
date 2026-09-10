import { relayOpsRoleTemplatePayloads } from "@kaneo/permissions";
import { describe, expect, it } from "vitest";
import {
  canDiscoverRelayOpsUiItem,
  RELAYOPS_UI_CAPABILITY_REGISTRY,
} from "./relayops-capabilities";

describe("RelayOps UI capability registry", () => {
  it("keeps Viewer read-only while exposing all read routes", () => {
    const grants = relayOpsRoleTemplatePayloads.viewer;

    expect(canDiscoverRelayOpsUiItem(grants, "route.overview")).toBe(true);
    expect(canDiscoverRelayOpsUiItem(grants, "route.workbench")).toBe(true);
    expect(canDiscoverRelayOpsUiItem(grants, "route.services")).toBe(true);
    expect(canDiscoverRelayOpsUiItem(grants, "action.incident.create")).toBe(
      false,
    );
    expect(
      canDiscoverRelayOpsUiItem(grants, "action.incident.transition"),
    ).toBe(false);
    expect(canDiscoverRelayOpsUiItem(grants, "action.legacy.export")).toBe(
      false,
    );
  });

  it("uses the same registry decision for an action and its command shortcut", () => {
    const grants = relayOpsRoleTemplatePayloads.responder;
    const item = RELAYOPS_UI_CAPABILITY_REGISTRY.find(
      (entry) => entry.id === "action.incident.transition",
    );

    expect(item?.surfaces).toEqual(["action", "command"]);
    expect(canDiscoverRelayOpsUiItem(grants, item?.id ?? "")).toBe(true);
  });

  it("fails closed for owned actions until primary-service ownership is proven", () => {
    const grants = relayOpsRoleTemplatePayloads.service_owner;

    expect(
      canDiscoverRelayOpsUiItem(grants, "action.incident.transition"),
    ).toBe(false);
    expect(
      canDiscoverRelayOpsUiItem(grants, "action.incident.transition", {
        primaryServiceOwned: true,
      }),
    ).toBe(true);
    expect(
      canDiscoverRelayOpsUiItem(grants, "action.incident.transition", {
        primaryServiceOwned: false,
      }),
    ).toBe(false);
  });

  it("does not infer privileges from commander assignment or unknown UI ids", () => {
    const viewer = relayOpsRoleTemplatePayloads.viewer;

    expect(
      canDiscoverRelayOpsUiItem(viewer, "action.incident.resolve", {
        primaryServiceOwned: false,
      }),
    ).toBe(false);
    expect(canDiscoverRelayOpsUiItem(viewer, "missing.action")).toBe(false);
  });

  it("requires saved-view owner/share context for update and delete discovery", () => {
    const responder = relayOpsRoleTemplatePayloads.responder;

    expect(
      canDiscoverRelayOpsUiItem(responder, "action.savedView.update"),
    ).toBe(false);
    expect(
      canDiscoverRelayOpsUiItem(responder, "action.savedView.update", {
        savedViewOwnerOrShare: true,
      }),
    ).toBe(true);
    expect(
      canDiscoverRelayOpsUiItem(
        relayOpsRoleTemplatePayloads.incident_commander,
        "action.savedView.update",
      ),
    ).toBe(true);
  });

  it("fails closed on malformed or unknown capability maps", () => {
    expect(
      canDiscoverRelayOpsUiItem(
        { incident: ["transition"], unknown: ["wildcard"] },
        "action.incident.transition",
      ),
    ).toBe(false);
    expect(
      canDiscoverRelayOpsUiItem(
        { incident: ["not_a_real_action"] },
        "action.incident.transition",
      ),
    ).toBe(false);
  });
});
