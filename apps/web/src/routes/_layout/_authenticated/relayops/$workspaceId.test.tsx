import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  RelayOpsErrorState,
  RelayOpsSkeleton,
} from "@/components/relayops/route-state";
import { RelayOpsApiError } from "@/fetchers/relayops";
import { i18n } from "@/lib/i18n";

afterEach(cleanup);
beforeAll(async () => {
  await i18n.changeLanguage("en-US");
  await i18n.loadNamespaces(["relayops"]);
});

function renderState(error: unknown) {
  const client = new QueryClient();
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <RelayOpsErrorState error={error} onRetry={() => undefined} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("RelayOps route states", () => {
  it("announces the loading state", () => {
    const client = new QueryClient();
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={client}>
          <RelayOpsSkeleton />
        </QueryClientProvider>
      </I18nextProvider>,
    );
    expect(
      screen.getByRole("status", { name: "Loading RelayOps" }),
    ).toBeInTheDocument();
  });

  it("renders the denied state for a permission failure", () => {
    renderState(new RelayOpsApiError("denied", 403));
    expect(
      screen.getByRole("heading", { name: "Access denied" }),
    ).toBeInTheDocument();
  });

  it("offers retry for a retryable failure", () => {
    renderState(new RelayOpsApiError("unavailable", 503));
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("does not offer retry for an unrecoverable missing resource", () => {
    renderState(new RelayOpsApiError("missing", 404));
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });
});
