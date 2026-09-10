export type SignalSeverity = "unknown" | "sev1" | "sev2" | "sev3" | "sev4";

export type SignalPanelSignal = {
  id: string;
  source: string;
  title: string;
  summary: string | null;
  observedAt: string;
  severityHint: SignalSeverity;
  ingestionStatus: "new" | "attached";
};

export type SignalPanelService = { id: string; name: string };

export type ManualSignalInput = {
  idempotencyKey: string;
  serviceId?: string;
  title: string;
  summary?: string;
  severityHint: SignalSeverity;
};

export type AttachSignalInput = {
  signalId: string;
  expectedVersion: number;
  idempotencyKey: string;
};

export type SignalPanelLabels = {
  title: string;
  description: string;
  intakeEyebrow: string;
  manualHeading: string;
  queueHeading: string;
  titleField: string;
  summaryField: string;
  serviceField: string;
  noService: string;
  severityField: string;
  createManual: string;
  createDemo: string;
  attach: string;
  attached: string;
  empty: string;
  pending: string;
  error: string;
  source: string;
  observedAt: string;
  severity: Record<SignalSeverity, string>;
};
