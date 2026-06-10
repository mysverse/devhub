"use client";

import { Button } from "@mantine/core";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { refreshMyBonusCandidates } from "@/app/dashboard/bonuses/actions";
import { signIn } from "@/lib/auth-client";

export default function RefreshBonusesButton() {
  const [loading, setLoading] = useState(false);

  async function handleRefresh() {
    setLoading(true);
    const result = await refreshMyBonusCandidates();
    setLoading(false);

    if ("reauth" in result && result.reauth) {
      signIn.oauth2({
        providerId: "linear",
        callbackURL: "/dashboard/bonuses",
      });
      return;
    }

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`Checked ${result.count ?? 0} Linear tasks`);
  }

  return (
    <Button
      variant="light"
      leftSection={<RefreshCw size={16} />}
      onClick={handleRefresh}
      loading={loading}
    >
      Refresh from Linear
    </Button>
  );
}
