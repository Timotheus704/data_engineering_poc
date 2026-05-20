import { z } from 'zod';

export const titanicCreateSchema = z.object({
  survived: z.number().int(),
  pclass: z.number().int(),
  name: z.string(),
  sex: z.string(),
  age: z.number().nullable().optional(),
  sib_sp: z.number().int().optional().default(0),
  parch: z.number().int().optional().default(0),
  ticket: z.string().optional().default(''),
  fare: z.number().optional().default(0),
  cabin: z.string().nullable().optional(),
  embarked: z.string().nullable().optional(),
});

export const titanicUpdateSchema = titanicCreateSchema.partial();

export type TitanicCreate = z.infer<typeof titanicCreateSchema>;
export type TitanicUpdate = z.infer<typeof titanicUpdateSchema>;
