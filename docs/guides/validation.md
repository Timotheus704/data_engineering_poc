# Request Validation with Zod

This guide explains how request and response validation works in the Fastify API,
how it connects to Swagger documentation, and how to add validation to new routes.

---

## Overview

The API uses [Zod](https://zod.dev) as the single source of truth for all schema
validation. Zod schemas serve three purposes simultaneously:

1. **Runtime validation** — invalid requests are rejected with a `400` response
   before they reach the database
2. **TypeScript types** — `z.infer<typeof schema>` produces the TypeScript type
   automatically, so schema and type are never out of sync
3. **OpenAPI documentation** — schemas are converted to JSON Schema via
   `zod-to-json-schema` and registered with Fastify's Swagger plugin, so
   `/docs` always reflects the actual validation rules

---

## Schema Location

All schemas live under `web/server/src/schemas/`:

```
web/server/src/schemas/
├── admin.ts        # SQL runner, table params
├── nyc_taxi.ts     # Taxi trip create/update/response
├── titanic.ts      # Titanic passenger create/update/response
└── index.ts        # Re-exports all schemas
```

Each file exports:
- A **create schema** (required fields for POST)
- An **update schema** (all fields optional, for PATCH)
- A **response schema** (includes `id` and `loaded_at`)
- TypeScript types inferred from each schema

---

## Example: Titanic Schema

```typescript
// web/server/src/schemas/titanic.ts
import { z } from 'zod';

export const titanicCreateSchema = z.object({
  survived:  z.number().int(),          // must be integer
  pclass:    z.number().int(),          // must be integer
  name:      z.string(),                // required string
  sex:       z.string(),                // required string
  age:       z.number().nullable().optional(),  // optional, can be null
  fare:      z.number().optional().default(0),  // optional with default
  cabin:     z.string().nullable().optional(),
  embarked:  z.string().nullable().optional(),
});

// TypeScript type derived automatically — no separate interface needed
export type TitanicCreate = z.infer<typeof titanicCreateSchema>;
```

---

## Adding Validation to a New Route

### Step 1: Define your schema

Add your schema to the appropriate file under `web/server/src/schemas/`:

```typescript
export const weatherCreateSchema = z.object({
  city:        z.string().min(1),
  recorded_at: z.string().datetime(),
  temp_c:      z.number().nullable().optional(),
  humidity_pct: z.number().int().min(0).max(100).nullable().optional(),
});

export type WeatherCreate = z.infer<typeof weatherCreateSchema>;
```

### Step 2: Wire into the route

```typescript
import { weatherCreateSchema, weatherResponseSchema } from '../schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';

fastify.post<{ Body: WeatherCreate }>(
  '/weather',
  {
    schema: {
      body: zodToJsonSchema(weatherCreateSchema as any),
      response: {
        201: zodToJsonSchema(z.object({ data: weatherResponseSchema }) as any)
      }
    },
    preValidation: async (request) => {
      request.body = weatherCreateSchema.parse(request.body);
    }
  },
  async (req, reply) => {
    // req.body is now fully typed as WeatherCreate
    const { city, recorded_at, temp_c } = req.body;
    // ...
  }
);
```

### Step 3: Verify in Swagger

Start the server and visit `http://localhost:3001/docs`. Your new route should
appear with the request body schema and example automatically populated.

---

## Validation Error Response Shape

When validation fails, the API returns:

```json
{
  "error": "ValidationError",
  "details": [
    {
      "path": "survived",
      "message": "Expected number, received string"
    }
  ]
}
```

HTTP status code: `400 Bad Request`

---

## Best Practices

- Use `.int()` for all integer fields (Postgres `SMALLINT`, `INTEGER`, `BIGINT`)
- Use `.nullable().optional()` only when both `null` and `undefined` (absent)
  are valid. Use `.optional()` alone when a field can be absent but not null.
- Use `.min()` and `.max()` for numeric ranges that have domain meaning
  (e.g., `passenger_count` must be between 1 and 6)
- Use `.datetime()` for timestamp strings to enforce ISO 8601 format
- Prefer explicit schemas over `.passthrough()` — unknown fields should
  be rejected, not silently passed through to the database

---

## Known Limitations

Some advanced Zod refinements (`.refine()`, `.transform()`) do not convert
cleanly to JSON Schema. In these cases the Swagger docs will show a partial
schema. The runtime validation will still work correctly. Keep handler-level
`safeParse` checks for any refinements that cannot be expressed in JSON Schema.

---

## Related Documentation

- [Adding a Pipeline](adding-a-pipeline.md) — how to wire validation into a
  new dataset end-to-end
- [API Reference](../reference/api.md) — all endpoints with request/response shapes
- [Web App Guide](web-app.md) — overall Fastify architecture