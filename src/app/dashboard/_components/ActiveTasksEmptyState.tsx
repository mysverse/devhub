import { ArrowRight, Sparkles } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import LinkButton from "@/components/LinkButton";

export default function ActiveTasksEmptyState() {
  return (
    <EmptyState
      icon={<Sparkles size={26} />}
      title="No active tasks yet"
      description="Claim a PPT from the board and it shows up here with its payout progress, activity timer, and next step."
      action={
        <LinkButton
          href="/dashboard/ppts"
          variant="light"
          color="blue"
          rightSection={<ArrowRight size={14} />}
        >
          Browse PPT Board
        </LinkButton>
      }
    />
  );
}
