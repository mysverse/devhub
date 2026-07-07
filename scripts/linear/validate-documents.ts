import {
  formatLinearDocumentValidationErrors,
  loadLinearGraphqlSchema,
  validateLinearGraphqlDocument,
} from "@/lib/linear-document-validation";
import { LINEAR_GRAPHQL_DOCUMENTS } from "@/lib/linear-documents";

const schema = loadLinearGraphqlSchema();
let failed = false;

for (const { name, document } of LINEAR_GRAPHQL_DOCUMENTS) {
  const errors = validateLinearGraphqlDocument(document, schema);
  if (errors.length === 0) continue;
  failed = true;
  console.error(formatLinearDocumentValidationErrors(name, errors));
}

if (failed) {
  process.exit(1);
}

const documentCount: number = LINEAR_GRAPHQL_DOCUMENTS.length;

console.log(
  `[linear:validate] ${documentCount} Linear GraphQL document${documentCount === 1 ? "" : "s"} validated`,
);
