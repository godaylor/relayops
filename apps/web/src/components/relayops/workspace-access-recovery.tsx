import { LogIn, MoveUpRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function WorkspaceAccessRecovery() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function switchAccount() {
    setPending(true);
    setFailed(false);
    try {
      const { authClient } = await import("@/lib/auth-client");
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed");
      // Drop cached data from the previous account before opening sign-in.
      const redirect =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      window.location.assign(
        `/auth/sign-in?${new URLSearchParams({ redirect })}`,
      );
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <p className="text-muted-foreground text-sm">
        {t("relayops:access.explanation")}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          className="h-auto min-h-11 max-w-full whitespace-normal py-2 text-center"
          render={<a href="/dashboard" />}
        >
          {t("relayops:access.ownWorkspace")}
          <MoveUpRight className="size-4" />
        </Button>
        <Button
          className="h-auto min-h-11 max-w-full whitespace-normal py-2 text-center"
          variant="outline"
          disabled={pending}
          onClick={() => void switchAccount()}
        >
          <LogIn className="size-4" />
          {t(pending ? "relayops:access.signingOut" : "relayops:access.signIn")}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          {t("relayops:access.signOutError")}
        </p>
      ) : null}
    </div>
  );
}
