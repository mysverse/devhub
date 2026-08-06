import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function PptOpenTasksDigest({
  userName,
  tasks,
  totalCount,
}: {
  userName: string;
  tasks: {
    identifier: string;
    title: string;
    payoutLabel: string;
    /** Why this task was picked for this developer, from the ranker. */
    because?: string;
  }[];
  totalCount: number;
}) {
  return (
    <BaseLayout previewText="Open PPTs worth a look this week">
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        Open PPTs This Week
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        You have no active tasks right now &mdash; a clean slate! There{" "}
        {totalCount === 1 ? "is" : "are"} {totalCount} open PPT
        {totalCount === 1 ? "" : "s"} on the board. The top picks:
      </Text>
      <Section
        style={{
          backgroundColor: "#2c2e33",
          borderRadius: "4px",
          padding: "12px 16px",
          margin: "16px 0",
        }}
      >
        {tasks.map((task) => (
          <Text
            key={task.identifier}
            style={{
              color: "#c1c2c5",
              fontSize: "14px",
              lineHeight: "24px",
              margin: "0 0 4px 0",
            }}
          >
            <span style={{ color: "#909296" }}>{task.identifier}</span>{" "}
            {task.title}{" "}
            <span style={{ color: "#69db7c", fontWeight: 600 }}>
              {task.payoutLabel}
            </span>
            {task.because && (
              <>
                <br />
                <span style={{ color: "#909296", fontSize: "12px" }}>
                  {task.because}
                </span>
              </>
            )}
          </Text>
        ))}
      </Section>
      <Button
        href={`${appUrl}/dashboard/ppts`}
        style={{
          backgroundColor: "#228be6",
          borderRadius: "6px",
          color: "#ffffff",
          display: "inline-block",
          fontSize: "14px",
          fontWeight: 600,
          padding: "10px 24px",
          textDecoration: "none",
        }}
      >
        Browse the Board
      </Button>
      <Text style={{ color: "#909296", fontSize: "12px", lineHeight: "20px" }}>
        This digest only goes out when you have no active tasks. Turn it off any
        time in HR Settings &rarr; Notification Preferences.
      </Text>
    </BaseLayout>
  );
}
