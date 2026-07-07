import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { buildClientSchema, getIntrospectionQuery, printSchema } from "graphql";
import { LINEAR_SCHEMA_PATH } from "@/lib/linear-document-validation";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const token = process.env.LINEAR_SERVICE_API_KEY ?? process.env.LINEAR_API_KEY;

if (!token) {
  throw new Error(
    "LINEAR_SERVICE_API_KEY or LINEAR_API_KEY is required to refresh the Linear schema",
  );
}

const response = await fetch("https://api.linear.app/graphql", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: token,
  },
  body: JSON.stringify({ query: getIntrospectionQuery() }),
});

const result = (await response.json()) as {
  data?: Parameters<typeof buildClientSchema>[0];
  errors?: { message: string }[];
};

if (!response.ok || result.errors?.length || !result.data) {
  const details = result.errors?.map((error) => error.message).join("; ");
  throw new Error(
    `Linear schema introspection failed: HTTP ${response.status}${details ? ` ${details}` : ""}`,
  );
}

const schema = buildClientSchema(result.data);
writeFileSync(LINEAR_SCHEMA_PATH, `${printSchema(schema)}\n`, "utf8");

console.log(`[linear:schema:update] Wrote ${LINEAR_SCHEMA_PATH}`);
