import assert from "node:assert/strict";
import { test } from "node:test";
import { handleLinear } from "./linear";

test("dev Linear mock rejects invalid DevHub GraphQL before dispatch", async () => {
  const response = await handleLinear(
    new Request("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query DevHubInvalidCommentUserId {
            issues(first: 1) {
              nodes {
                comments(first: 1) {
                  nodes { id userId }
                }
              }
            }
          }
        `,
      }),
    }),
    new URL("https://api.linear.app/graphql"),
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as { errors?: { message: string }[] };
  assert.ok(
    body.errors?.some((error) =>
      error.message.includes('Cannot query field "userId" on type "Comment"'),
    ),
  );
});
