import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { Button } from "@/components/ui/button";
import useGetFullWorkspace from "@/hooks/queries/workspace/use-get-full-workspace";
import { authClient } from "@/lib/auth-client";

export function AccountContext({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const workspace = useGetFullWorkspace({ workspaceId });
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const role = workspace.data?.members.find(
    (member) => member.userId === user?.id,
  )?.role;
  const roleLabels = {
    owner: t("relayops:role.owner"),
    admin: t("relayops:role.admin"),
    member: t("relayops:role.member"),
    viewer: t("relayops:role.viewer"),
    responder: t("relayops:role.responder"),
    incident_commander: t("relayops:role.incident_commander"),
    service_owner: t("relayops:role.service_owner"),
    workspace_admin: t("relayops:role.workspace_admin"),
  };
  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed");
      // A full navigation drops all workspace caches along with the session.
      window.location.assign("/auth/sign-in");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }
  return (
    <section
      data-guide="account"
      className="mx-auto flex max-w-[92rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm [overflow-wrap:anywhere] sm:px-6"
    >
      <span>{t("relayops:account.signedIn", { name: user?.name ?? "…" })}</span>
      <span>
        {t("relayops:account.workspace", { name: workspace.data?.name ?? "…" })}
      </span>
      {role ? (
        <span>
          {t("relayops:account.role", {
            role: role
              .split(",")
              .map(
                (name) => roleLabels[name as keyof typeof roleLabels] ?? name,
              )
              .join(", "),
          })}
        </span>
      ) : null}
      <Link
        to="/dashboard"
        className="inline-flex min-h-11 items-center underline"
      >
        {t("relayops:account.switch")}
      </Link>
      <Link
        to="/dashboard/workspace/$workspaceId/members"
        params={{ workspaceId }}
        className="inline-flex min-h-11 items-center underline"
      >
        {t("relayops:account.members")}
      </Link>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => void signOut()}
      >
        {t("relayops:account.signOut")}
      </Button>
      {failed ? <p role="alert">{t("relayops:account.error")}</p> : null}
      <details className="basis-full max-w-2xl text-muted-foreground">
        <summary className="cursor-pointer py-2">
          {t("relayops:account.rolesTitle")}
        </summary>
        <p>{t("relayops:account.rolesBody")}</p>
      </details>
    </section>
  );
}
