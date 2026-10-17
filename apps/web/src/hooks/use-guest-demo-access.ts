import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { prepareGuestDemo } from "@/lib/guest-demo";
import { toast } from "@/lib/toast";

export function useGuestDemoAccess() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [isPending, setPending] = useState(false);

  async function openGuestDemo() {
    if (isPending) return;
    setPending(true);
    try {
      const { workspaceId } = await prepareGuestDemo({
        workspaceName: t("relayops:guest.workspaceName"),
        workspaceDescription: t("relayops:guest.workspaceDescription"),
        serviceName: t("relayops:guest.serviceName"),
        serviceDescription: t("relayops:guest.serviceDescription"),
        locale: i18n.resolvedLanguage === "ru-RU" ? "ru-RU" : "en-US",
      });
      toast.success(t("auth:signIn.guestSuccess"));
      // A guest never follows a shared link into another person's workspace.
      await navigate({
        to: "/relayops/$workspaceId",
        params: { workspaceId },
        replace: true,
      });
    } catch {
      toast.error(t("auth:signIn.guestError"));
    } finally {
      setPending(false);
    }
  }

  return { isPending, openGuestDemo };
}
