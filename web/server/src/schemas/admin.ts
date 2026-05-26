import { z } from 'zod';

export const adminQuerySchema = z.object({ sql: z.string() });
export const adminTableParamsSchema = z.object({ schema: z.enum(['staging', 'analytics']), table: z.string() });

export const adminQueryResponseSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  row_count: z.number().int(),
});

export type AdminQuery = z.infer<typeof adminQuerySchema>;
export type AdminTableParams = z.infer<typeof adminTableParamsSchema>;
export type AdminQueryResponse = z.infer<typeof adminQueryResponseSchema>;
