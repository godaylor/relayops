import type { RelayOpsIncidentDetail } from "@/fetchers/relayops";
import type {
  SavedWorkbenchDefinition,
  WorkbenchColumnId,
  WorkbenchSearch,
} from "@/lib/relayops-workbench-search";

export type WorkbenchIncidentItem = {
  id: string;
  key: string;
  title: string;
  summary: string | null;
  status:
    | "detected"
    | "triaging"
    | "mitigating"
    | "monitoring"
    | "resolved"
    | "dismissed";
  severity: "unknown" | "sev1" | "sev2" | "sev3" | "sev4";
  impact: "unknown" | "none" | "degraded" | "partial_outage" | "full_outage";
  version: number;
  detectedAt: string;
  resolvedAt: string | null;
  lastUpdateAt: string;
  service: { id: string; name: string; slug: string };
  affectedServices: Array<{ id: string; name: string; slug: string }>;
  commander: { id: string; name: string } | null;
  responders: Array<{ id: string; name: string }>;
};

export type WorkbenchFacetValue = {
  value: string;
  label: string;
  count: number;
};

export type WorkbenchPage = {
  items: WorkbenchIncidentItem[];
  nextCursor: string | null;
  facets: {
    status: WorkbenchFacetValue[];
    severity: WorkbenchFacetValue[];
    service: WorkbenchFacetValue[];
    commander: WorkbenchFacetValue[];
  };
  groups: WorkbenchFacetValue[];
};

export type WorkbenchSavedView = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  name: string;
  visibility: "private" | "workspace";
  schemaVersion: 1;
  definition: SavedWorkbenchDefinition;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type SavedViewConflict = {
  draftName: string;
  expectedVersion: number;
  current: WorkbenchSavedView;
};

export type WorkbenchLabels = {
  title: string;
  description: string;
  searchLabel: string;
  searchPlaceholder: string;
  applyFilters: string;
  clearFilters: string;
  statusFilter: string;
  severityFilter: string;
  from: string;
  to: string;
  group: string;
  density: string;
  compact: string;
  comfortable: string;
  columns: string;
  pinColumn: string;
  moveEarlier: string;
  moveLater: string;
  narrowColumn: string;
  widenColumn: string;
  sortColumn: string;
  selectIncident: string;
  loading: string;
  backgroundRefresh: string;
  deniedTitle: string;
  deniedDescription: string;
  errorTitle: string;
  retry: string;
  emptyTitle: string;
  emptyDescription: string;
  filteredEmptyTitle: string;
  filteredEmptyDescription: string;
  loadMore: string;
  loadingMore: string;
  inspectorTitle: string;
  inspectorDescription: string;
  inspectorLoading: string;
  openRoom: string;
  hourShort: string;
  minuteShort: string;
  impactById: Record<WorkbenchIncidentItem["impact"], string>;
  closeInspector: string;
  savedViews: string;
  unsavedView: string;
  saveCurrentView: string;
  updateSavedView: string;
  viewName: string;
  privateVisibility: string;
  workspaceVisibility: string;
  conflictTitle: string;
  conflictDescription: string;
  conflictDraft: string;
  conflictCurrent: string;
  useCurrent: string;
  retryDraft: string;
  selectedCount: string;
  partialBulk: string;
  columnsById: Record<WorkbenchColumnId, string>;
  groupsById: Record<WorkbenchSearch["group"], string>;
  statusById: Record<WorkbenchIncidentItem["status"], string>;
  severityById: Record<WorkbenchIncidentItem["severity"], string>;
};

export type IncidentWorkbenchProps = {
  workspaceId: string;
  search: WorkbenchSearch;
  labels: WorkbenchLabels;
  state: "loading" | "ready" | "denied" | "error";
  page?: WorkbenchPage;
  error?: Error | null;
  isFetching?: boolean;
  isLoadingMore?: boolean;
  selectedDetail?: RelayOpsIncidentDetail;
  selectedDetailLoading?: boolean;
  savedViews?: WorkbenchSavedView[];
  savedViewConflict?: SavedViewConflict;
  partialBulk?: { succeeded: number; total: number };
  onSearchChange: (next: WorkbenchSearch) => void;
  onSelectIncident: (incidentId?: string) => void;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onCreateSavedView?: (
    name: string,
    visibility: "private" | "workspace",
  ) => void;
  onUpdateSavedView?: (view: WorkbenchSavedView) => void;
  onUseCurrentSavedView?: (view: WorkbenchSavedView) => void;
  onRetrySavedViewDraft?: (conflict: SavedViewConflict) => void;
};
