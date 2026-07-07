import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildSchema,
  type GraphQLSchema,
  parse,
  type SourceLocation,
  validate,
} from "graphql";

export const LINEAR_SCHEMA_PATH = path.join(
  process.cwd(),
  "scripts/linear/linear.schema.graphql",
);

let cachedSchema: GraphQLSchema | null = null;

export type LinearDocumentValidationError = {
  message: string;
  locations: readonly SourceLocation[] | undefined;
};

export function loadLinearGraphqlSchema(schemaPath = LINEAR_SCHEMA_PATH) {
  if (schemaPath === LINEAR_SCHEMA_PATH && cachedSchema) return cachedSchema;
  const schema = buildSchema(readFileSync(schemaPath, "utf8"));
  if (schemaPath === LINEAR_SCHEMA_PATH) cachedSchema = schema;
  return schema;
}

export function validateLinearGraphqlDocument(
  document: string,
  schema = loadLinearGraphqlSchema(),
): LinearDocumentValidationError[] {
  try {
    const ast = parse(document);
    return validate(schema, ast).map((error) => ({
      message: error.message,
      locations: error.locations,
    }));
  } catch (error) {
    return [
      {
        message: error instanceof Error ? error.message : String(error),
        locations: undefined,
      },
    ];
  }
}

export function formatLinearDocumentValidationErrors(
  name: string,
  errors: LinearDocumentValidationError[],
) {
  return errors
    .map((error) => {
      const location = error.locations?.[0];
      const suffix = location ? ` at ${location.line}:${location.column}` : "";
      return `${name}: ${error.message}${suffix}`;
    })
    .join("\n");
}
