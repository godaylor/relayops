import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import {
  defaultWorkbenchColumns,
  defaultWorkbenchSort,
} from "@/lib/relayops-workbench-search";
import { workbenchItem, workbenchLabels } from "./test-fixtures";
import {
  VirtualizedIncidentTable,
  WorkbenchColumnConfiguration,
} from "./virtualized-incident-table";

describe("VirtualizedIncidentTable", () => {
  it("renders a bounded viewport and supports keyboard row opening", () => {
    const onSelect = vi.fn();
    render(
      <VirtualizedIncidentTable
        items={Array.from({ length: 100 }, (_, index) => workbenchItem(index))}
        columns={defaultWorkbenchColumns}
        sort={defaultWorkbenchSort}
        density="compact"
        selectedIds={new Set()}
        labels={workbenchLabels}
        viewportHeight={176}
        onSortChange={vi.fn()}
        onSelectIncident={onSelect}
        onSelectionChange={vi.fn()}
      />,
    );

    const renderedRows = screen.getAllByTestId("workbench-row");
    expect(renderedRows.length).toBeLessThan(20);
    expect(renderedRows.length).toBeGreaterThanOrEqual(4);
    fireEvent.keyDown(renderedRows[0]!, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(
      "incident-0",
      expect.any(HTMLTableRowElement),
    );
  });

  it("loads the next cursor page near the bounded scroll edge", () => {
    const onLoadMore = vi.fn();
    render(
      <VirtualizedIncidentTable
        items={Array.from({ length: 100 }, (_, index) => workbenchItem(index))}
        columns={defaultWorkbenchColumns}
        sort={defaultWorkbenchSort}
        density="compact"
        selectedIds={new Set()}
        labels={workbenchLabels}
        viewportHeight={176}
        hasMore
        onSortChange={vi.fn()}
        onSelectIncident={vi.fn()}
        onSelectionChange={vi.fn()}
        onLoadMore={onLoadMore}
      />,
    );

    const scroller = screen.getByRole("table").parentElement;
    expect(scroller).not.toBeNull();
    Object.defineProperties(scroller!, {
      clientHeight: { configurable: true, value: 176 },
      scrollHeight: { configurable: true, value: 4_400 },
    });
    fireEvent.scroll(scroller!, { target: { scrollTop: 4_250 } });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("workbench-row").length).toBeLessThan(20);
  });

  it("keeps column order, pin and width controlled", () => {
    const onChange = vi.fn();
    render(
      <WorkbenchColumnConfiguration
        columns={defaultWorkbenchColumns.slice(0, 2)}
        labels={workbenchLabels}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Columns"));
    fireEvent.click(screen.getByLabelText("Widen: Key"));
    expect(onChange).toHaveBeenCalledWith([
      { id: "key", pin: "left", width: 136 },
      { id: "severity", pin: "left", width: 92 },
    ]);
    fireEvent.click(screen.getByLabelText("Pin column: Key"));
    expect(onChange).toHaveBeenLastCalledWith([
      { id: "key", pin: "right", width: 112 },
      { id: "severity", pin: "left", width: 92 },
    ]);
  });

  it("uses shift-click for ordered multi-sort", () => {
    const onSortChange = vi.fn();
    render(
      <VirtualizedIncidentTable
        items={[workbenchItem(0)]}
        columns={defaultWorkbenchColumns}
        sort={[{ field: "severity", direction: "desc" }]}
        density="compact"
        selectedIds={new Set()}
        labels={workbenchLabels}
        onSortChange={onSortChange}
        onSelectIncident={vi.fn()}
        onSelectionChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Sort: Status"), {
      shiftKey: true,
    });
    expect(onSortChange).toHaveBeenCalledWith([
      { field: "severity", direction: "desc" },
      { field: "status", direction: "asc" },
    ]);
  });
});
