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
  it("keeps mobile cards bounded and returns their button as the inspector focus target", () => {
    vi.stubGlobal("innerWidth", 390);
    try {
      const onSelect = vi.fn();
      const { container } = render(
        <VirtualizedIncidentTable
          items={Array.from({ length: 100 }, (_, index) =>
            workbenchItem(index),
          )}
          columns={defaultWorkbenchColumns}
          sort={defaultWorkbenchSort}
          density="compact"
          selectedIds={new Set()}
          labels={workbenchLabels}
          viewportHeight={240}
          onSortChange={vi.fn()}
          onSelectIncident={onSelect}
          onSelectionChange={vi.fn()}
        />,
      );
      expect(screen.getAllByRole("listitem").length).toBeLessThan(20);
      const trigger = container.querySelector(".relay-mobile-incident button");
      if (!trigger) throw new Error("Expected a mobile incident button");
      fireEvent.click(trigger);
      expect(onSelect).toHaveBeenCalledWith("incident-0", trigger);
    } finally {
      vi.unstubAllGlobals();
    }
  });
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
    const firstRow = renderedRows[0];
    if (!firstRow) {
      throw new Error("Expected the virtualized table to render a row");
    }
    fireEvent.keyDown(firstRow, { key: "Enter" });
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
    if (!scroller) {
      throw new Error("Expected the virtualized table to expose a scroller");
    }
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 176 },
      scrollHeight: { configurable: true, value: 4_400 },
    });
    fireEvent.scroll(scroller, { target: { scrollTop: 4_250 } });
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
      { id: "key", pin: "left", width: 120 },
      { id: "title", pin: null, width: 280 },
    ]);
    fireEvent.click(screen.getByLabelText("Pin column: Key"));
    expect(onChange).toHaveBeenLastCalledWith([
      { id: "key", pin: "right", width: 96 },
      { id: "title", pin: null, width: 280 },
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
