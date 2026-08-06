import { Button, Section, Text } from "react-email";
import BaseLayout from "./BaseLayout";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * For developers who onboarded but never claimed anything — the population the
 * old digest audience filter excluded outright. Deliberately different from
 * the regular digest: fewer tasks, the smallest ones, each with the reason it
 * was picked, and no framing that assumes they already know how any of this
 * works.
 */
export default function FirstTaskInvite({
  userName,
  tasks,
  needsLinearLink,
}: {
  userName: string;
  tasks: {
    identifier: string;
    title: string;
    payoutLabel: string;
    because: string;
  }[];
  /** Account exists but Linear isn't connected, so claiming isn't possible yet. */
  needsLinearLink: boolean;
}) {
  return (
    <BaseLayout
      previewText={
        needsLinearLink
          ? "One step left before you can claim a task"
          : "A few first tasks picked out for you"
      }
    >
      <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
        {needsLinearLink ? "One step left" : "Ready for your first task?"}
      </Text>
      <Text style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}>
        Hi {userName},
      </Text>

      {needsLinearLink ? (
        <Text
          style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}
        >
          Your DevHub account is set up, but Linear isn&rsquo;t connected yet
          &mdash; that&rsquo;s where tasks live, so claiming isn&rsquo;t
          possible until it&rsquo;s linked. It takes about a minute.
        </Text>
      ) : (
        <>
          <Text
            style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}
          >
            You haven&rsquo;t claimed a task yet, so here are the smallest ones
            on the board right now. Claiming reserves a task for you instantly
            &mdash; finish it, post proof, and the payout is created
            automatically.
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
              <Section key={task.identifier} style={{ margin: "0 0 12px 0" }}>
                <Text
                  style={{
                    color: "#c1c2c5",
                    fontSize: "14px",
                    lineHeight: "22px",
                    margin: 0,
                  }}
                >
                  <span style={{ color: "#909296" }}>{task.identifier}</span>{" "}
                  {task.title}{" "}
                  <span style={{ color: "#69db7c", fontWeight: 600 }}>
                    {task.payoutLabel}
                  </span>
                </Text>
                <Text
                  style={{
                    color: "#909296",
                    fontSize: "12px",
                    lineHeight: "18px",
                    margin: "2px 0 0 0",
                  }}
                >
                  {task.because}
                </Text>
              </Section>
            ))}
          </Section>
        </>
      )}

      <Button
        href={`${appUrl}${needsLinearLink ? "/dashboard/settings" : "/dashboard/ppts"}`}
        style={{
          backgroundColor: "#228be6",
          borderRadius: "6px",
          color: "#ffffff",
          display: "inline-block",
          fontSize: "14px",
          fontWeight: 600,
          padding: "10px 18px",
          textDecoration: "none",
        }}
      >
        {needsLinearLink ? "Connect Linear" : "Browse the board"}
      </Button>

      <Text style={{ color: "#909296", fontSize: "12px", lineHeight: "20px" }}>
        Not the right time? You can turn these off in DevHub settings.
      </Text>
    </BaseLayout>
  );
}
