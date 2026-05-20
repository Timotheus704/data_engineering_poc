import { z } from 'zod';

export const adminQuerySchema = z.object({ sql: z.string() });
export const adminTableParamsSchema = z.object({ schema: z.enum(['staging', 'analytics']), table: z.string() });

export type AdminQuery = z.infer<typeof adminQuerySchema>;
export type AdminTableParams = z.infer<typeof adminTableParamsSchema>;
