export const relayOpsAllowedTransitions = {
  detected: ["triaging", "dismissed"],
  triaging: ["mitigating", "monitoring", "resolved", "dismissed"],
  mitigating: ["monitoring", "resolved"],
  monitoring: ["mitigating", "resolved"],
  resolved: ["monitoring"],
  dismissed: ["triaging"],
} as const;

export type RelayOpsIncidentStatus = keyof typeof relayOpsAllowedTransitions;
export type RelayOpsTransitionTarget =
  (typeof relayOpsAllowedTransitions)[RelayOpsIncidentStatus][number];

export function relayOpsTransitionTargets(status: RelayOpsIncidentStatus) {
  return relayOpsAllowedTransitions[
    status
  ] as readonly RelayOpsTransitionTarget[];
}
