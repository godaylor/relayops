import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceCatalogFilters } from "./service-catalog-filters";

afterEach(cleanup);

describe("ServiceCatalogFilters", () => {
  it("keeps the focused input, draft and caret when its applied URL arrives", () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <ServiceCatalogFilters search={{ status: "active" }} onApply={onApply} />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: " pay " } });
    input.setSelectionRange(3, 3);
    fireEvent.submit(input.form as HTMLFormElement);
    expect(onApply).toHaveBeenCalledWith({ q: "pay", status: "active" });

    rerender(
      <ServiceCatalogFilters
        search={{ q: "pay", status: "active" }}
        onApply={onApply}
      />,
    );
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue(" pay ");
    expect(input.selectionStart).toBe(3);

    fireEvent.change(input, { target: { value: " payment " } });
    input.setSelectionRange(5, 5);
    rerender(
      <ServiceCatalogFilters
        search={{ q: "pay", status: "active" }}
        onApply={onApply}
      />,
    );
    expect(input).toHaveValue(" payment ");
    expect(input.selectionStart).toBe(5);
  });

  it("synchronizes external URL and reset changes without replacing controls", () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <ServiceCatalogFilters
        search={{ q: "checkout", status: "active" }}
        onApply={onApply}
      />,
    );
    const input = screen.getByRole("textbox");
    const select = screen.getByRole("combobox");
    rerender(
      <ServiceCatalogFilters
        search={{ q: "api", status: "archived" }}
        onApply={onApply}
      />,
    );
    expect(input).toHaveValue("api");
    expect(select).toHaveValue("archived");
    expect(screen.getByRole("textbox")).toBe(input);
    expect(screen.getByRole("combobox")).toBe(select);
    rerender(
      <ServiceCatalogFilters search={{ status: "active" }} onApply={onApply} />,
    );
    expect(input).toHaveValue("");
    expect(select).toHaveValue("active");
  });
});
