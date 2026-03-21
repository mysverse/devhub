import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type React from "react";

const main: React.CSSProperties = {
  backgroundColor: "#1a1b1e",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: "#25262b",
  borderRadius: "8px",
  margin: "40px auto",
  padding: "32px",
  maxWidth: "560px",
};

const footer: React.CSSProperties = {
  color: "#909296",
  fontSize: "12px",
  lineHeight: "20px",
  textAlign: "center" as const,
};

export default function BaseLayout({
  children,
  previewText,
}: {
  children: React.ReactNode;
  previewText?: string;
}) {
  return (
    <Html>
      <Head />
      {previewText && <Preview>{previewText}</Preview>}
      <Body style={main}>
        <Container style={container}>
          <Text
            style={{ color: "#c1c2c5", fontSize: "14px", lineHeight: "24px" }}
          >
            {children}
          </Text>
          <Hr style={{ borderColor: "#373a40", margin: "24px 0" }} />
          <Section>
            <Text style={footer}>
              MYSverse DevHub
              <br />
              This is an automated message. Please do not reply directly to this
              email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
