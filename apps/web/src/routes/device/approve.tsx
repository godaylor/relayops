import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import { AuthLayout } from "@/components/auth/layout";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

const approveSearchSchema = z.object({
  user_code: z.string().optional(),
});

export const Route = createFileRoute("/device/approve")({
  component: DeviceApprovePage,
  validateSearch: approveSearchSchema,
});

function DeviceApprovePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: "/device/approve" });
  const { data: session, isPending } = authClient.useSession();
  const [processing, setProcessing] = useState(false);

  const normalizedCode =
    search.user_code?.trim().replace(/-/g, "").toUpperCase() ?? "";

  if (isPending) {
    return (
      <AuthLayout
        title={t("securityApproval:device.title")}
        subtitle={t("securityApproval:loading")}
      >
        <div className="text-sm text-muted-foreground">
          {t("securityApproval:device.checkingSession")}
        </div>
      </AuthLayout>
    );
  }

  if (!session?.user) {
    if (!normalizedCode) {
      return (
        <AuthLayout
          title={t("securityApproval:device.title")}
          subtitle={t("securityApproval:device.noCode")}
        >
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => void navigate({ to: "/device" })}
          >
            {t("securityApproval:device.enterCode")}
          </Button>
        </AuthLayout>
      );
    }
    const redirectTarget = `/device/approve?user_code=${encodeURIComponent(normalizedCode)}`;
    return (
      <AuthLayout
        title={t("securityApproval:signInTitle")}
        subtitle={t("securityApproval:device.signInSubtitle")}
      >
        <Button
          className="w-full"
          onClick={() =>
            void navigate({
              to: "/auth/sign-in",
              search: { redirect: redirectTarget },
            })
          }
        >
          {t("securityApproval:signIn")}
        </Button>
      </AuthLayout>
    );
  }

  if (!normalizedCode) {
    return (
      <AuthLayout
        title={t("securityApproval:device.title")}
        subtitle={t("securityApproval:device.noCode")}
      >
        <Button
          className="w-full"
          variant="secondary"
          onClick={() => void navigate({ to: "/device" })}
        >
          {t("securityApproval:device.enterCode")}
        </Button>
      </AuthLayout>
    );
  }

  const handleApprove = async () => {
    setProcessing(true);
    try {
      // better-auth >= 1.6.11 requires the signed-in user to claim the code
      // (GET /device) before it can be approved. No-op if already claimed.
      await authClient.device({ query: { user_code: normalizedCode } });
      const res = await authClient.device.approve({
        userCode: normalizedCode,
      });
      if (res.error) {
        toast.error(
          res.error.error_description ??
            t("securityApproval:device.approveError"),
        );
        return;
      }
      toast.success(t("securityApproval:device.connected"));
      void navigate({ to: "/dashboard" });
    } catch {
      toast.error(t("securityApproval:device.approveError"));
    } finally {
      setProcessing(false);
    }
  };

  const handleDeny = async () => {
    setProcessing(true);
    try {
      // Claim the code first (see handleApprove) so deny is authorized in
      // better-auth >= 1.6.11.
      await authClient.device({ query: { user_code: normalizedCode } });
      const res = await authClient.device.deny({
        userCode: normalizedCode,
      });
      if (res.error) {
        toast.error(
          res.error.error_description ?? t("securityApproval:device.denyError"),
        );
        return;
      }
      toast.message(t("securityApproval:device.cancelled"));
      void navigate({ to: "/dashboard" });
    } catch {
      toast.error(t("securityApproval:device.denyError"));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AuthLayout
      title={t("securityApproval:device.title")}
      subtitle={t("securityApproval:device.subtitle")}
    >
      <div className="space-y-4">
        <p className="text-center font-mono text-sm tracking-wide">
          {normalizedCode}
        </p>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={processing}
            onClick={() => void handleApprove()}
          >
            {t("securityApproval:approve")}
          </Button>
          <Button
            variant="outline"
            disabled={processing}
            onClick={() => void handleDeny()}
          >
            {t("securityApproval:deny")}
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
