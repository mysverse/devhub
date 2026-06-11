import { ArrowRight, Sparkles } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import LinkButton from "@/components/LinkButton";

export default function ActiveTasksEmptyState() {
  return (
    <EmptyState
      icon={<Sparkles size={26} />}
      title="No active tasks yet"
      description="Pick up a PPT from the board to start earning. Tasks you claim will show up here."
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
