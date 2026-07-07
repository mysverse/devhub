import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadLinearGraphqlSchema,
  validateLinearGraphqlDocument,
} from "./linear-document-validation";
import { LINEAR_GRAPHQL_DOCUMENTS } from "./linear-documents";

const schema = loadLinearGraphqlSchema();

test("all committed Linear GraphQL documents validate against the schema snapshot", () => {
  const failures = LINEAR_GRAPHQL_DOCUMENTS.flatMap(({ name, document }) =>
    validateLinearGraphqlDocument(document, schema).map(
      (error) => `${name}: ${error.message}`,
    ),
  );

  assert.deepEqual(failures, []);
});

test("Linear document validation rejects invalid Comment.userId selections", () => {
  const errors = validateLinearGraphqlDocument(
    `
      query InvalidCommentUserId {
        issues(first: 1) {
          nodes {
            comments(first: 1) {
              nodes { id userId }
            }
          }
        }
      }
    `,
    schema,
  );

  assert.ok(
    errors.some((error) =>
      error.message.includes('Cannot query field "userId" on type "Comment"'),
    ),
  );
});
