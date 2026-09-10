import type { TFunction } from "i18next";
import type { ResponseBoardLabels } from "./types";

export function getResponseBoardLabels(t: TFunction): ResponseBoardLabels {
  return {
    title: t("relayops:board.title"),
    description: t("relayops:board.description"),
    count: (count) => t("relayops:board.count", { count }),
    statusById: {
      detected: t("relayops:lifecycle.detected"),
      triaging: t("relayops:lifecycle.triaging"),
      mitigating: t("relayops:lifecycle.mitigating"),
      monitoring: t("relayops:lifecycle.monitoring"),
      resolved: t("relayops:lifecycle.resolved"),
      dismissed: t("relayops:lifecycle.dismissed"),
    },
    severityById: {
      unknown: t("relayops:severity.unknown"),
      sev1: t("relayops:severity.sev1"),
      sev2: t("relayops:severity.sev2"),
      sev3: t("relayops:severity.sev3"),
      sev4: t("relayops:severity.sev4"),
    },
    dragHandle: (title) => t("relayops:board.dragHandle", { title }),
    moveTo: (title) => t("relayops:board.moveTo", { title }),
    openIncident: (title) => t("relayops:board.openIncident", { title }),
    pending: t("relayops:board.pending"),
    emptyLane: t("relayops:board.emptyLane"),
    invalidTarget: t("relayops:board.invalidTarget"),
    invalidTargetDescription: (title, target) =>
      t("relayops:board.invalidTargetDescription", { title, target }),
    dndDisabled: t("relayops:board.dndDisabled"),
    reducedMotionFallback: t("relayops:board.reducedMotionFallback"),
    screenReaderInstructions: t("relayops:board.screenReaderInstructions"),
    lift: (title, source) => t("relayops:board.lift", { title, source }),
    target: (title, target) => t("relayops:board.target", { title, target }),
    invalid: (title, target) => t("relayops:board.invalid", { title, target }),
    dropPending: (title, target) =>
      t("relayops:board.dropPending", { title, target }),
    cancelled: (title) => t("relayops:board.cancelled", { title }),
    accepted: (title, target) =>
      t("relayops:board.accepted", { title, target }),
    rollback: (title, source) =>
      t("relayops:board.rollback", { title, source }),
    failedTitle: t("relayops:board.failedTitle"),
    conflictTitle: t("relayops:board.conflictTitle"),
    conflictDescription: (title, version) =>
      t("relayops:board.conflictDescription", { title, version }),
    yourMove: t("relayops:board.yourMove"),
    currentState: t("relayops:board.currentState"),
    compare: t("relayops:board.compare"),
    reapply: t("relayops:board.reapply"),
    discard: t("relayops:board.discard"),
    undo: t("relayops:board.undo"),
    undoDescription: (title, from, to) =>
      t("relayops:board.undoDescription", { title, from, to }),
  };
}
