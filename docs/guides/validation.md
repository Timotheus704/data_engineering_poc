Validation with Zod

Overview
- Zod is used as the single source of truth for request/response schemas in the Fastify API.
- Schemas live under web/server/src/schemas and are exported from index.ts for easy reuse.
- zod-to-json-schema converts Zod schemas to JSON Schema for Fastify/AJv and OpenAPI (Swagger).

Where to add schemas
1. Create a file under web/server/src/schemas for the dataset (e.g., my_dataset.ts).
2. Export create/update/request/response schemas and TS types via z.infer.
3. Add domain validations (refinements, min/max, integer checks) in the Zod schema.

Wiring into routes
- Import the Zod schemas from web/server/src/schemas.
- Use zodToJsonSchema(schema as any) in the route "schema" option for body/params/query/response so Fastify/AJv and Swagger get the JSON Schema.
- Keep handler-level zod.safeParse for an incremental migration; once tests and confidence are complete, the Fastify type-provider + route schemas can be relied on to validate at the boundary.

OpenAPI / Swagger
- The server registers Zod-converted schemas as components so examples and response schemas appear in /docs.
- To add examples: add a .example object on the converted schema in web/server/src/index.ts.

Best practices
- Prefer strong, explicit types: z.number().int().min(0), z.string().min(1), etc.
- Use .nullable() only when the domain permits null. Prefer optional over nullable when absent and null have different meanings.
- Keep response schemas as explicit Zod objects (include id, loaded_at) so docs show outputs.
- Add integration tests asserting 400 for invalid payloads and positive tests for successful flows.

Removing safeParse
- After full coverage and Swagger confirmation, remove handler safeParse and rely on Fastify withTypeProvider and route schemas. Keep this change in a separate PR.

Troubleshooting
- Some advanced Zod refinements (custom refinements or transformations) may not convert perfectly to JSON Schema. Keep handler-level checks for those cases until a replacement pattern is agreed.
- If Swagger doesn't show an operation-level schema, ensure the route sets the "response" property in the route schema (not just components).

Contact
- For questions about schema design choices, ping the repo owner or add an issue describing the domain constraint.
