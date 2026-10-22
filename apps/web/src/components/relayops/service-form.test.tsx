import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { RelayOpsServiceInput } from "@/fetchers/relayops";
import { i18n } from "@/lib/i18n";
import { ServiceForm } from "./service-form";

beforeAll(async () => {
  await i18n.changeLanguage("en-US");
  await i18n.loadNamespaces(["relayops"]);
});
afterEach(cleanup);

it("retains the draft and permits retry after a rejected service mutation", async () => {
  const mutate = vi
    .fn<(input: RelayOpsServiceInput) => Promise<void>>()
    .mockRejectedValueOnce(new Error("Temporary server failure"))
    .mockResolvedValueOnce();

  function FormOwner() {
    const [error, setError] = useState<unknown>();
    const [saved, setSaved] = useState(false);
    return (
      <>
        <ServiceForm
          teams={[]}
          pending={false}
          error={error}
          submitLabel="Save service form"
          onSubmit={async (input) => {
            try {
              await mutate(input);
              setError(undefined);
              setSaved(true);
            } catch (failure) {
              setError(failure);
              throw failure;
            }
          }}
        />
        {saved ? <p role="status">Saved test service</p> : null}
      </>
    );
  }

  render(
    <I18nextProvider i18n={i18n}>
      <FormOwner />
    </I18nextProvider>,
  );
  const name = screen.getByLabelText("Service name");
  const slug = screen.getByLabelText("Service identifier");
  const description = screen.getByLabelText("Description (optional)");
  const save = screen.getByRole("button", { name: "Save service form" });
  fireEvent.change(name, { target: { value: "Verification service" } });
  fireEvent.change(slug, { target: { value: "verification-service" } });
  fireEvent.change(description, { target: { value: "Keep this draft." } });
  fireEvent.click(save);

  expect(await screen.findByRole("alert")).toBeVisible();
  expect(name).toHaveValue("Verification service");
  expect(slug).toHaveValue("verification-service");
  expect(description).toHaveValue("Keep this draft.");
  expect(save).toBeEnabled();

  fireEvent.click(save);
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Saved test service",
  );
  expect(mutate.mock.calls[1]?.[0]).toEqual(mutate.mock.calls[0]?.[0]);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
