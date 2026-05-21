import { z } from 'zod';

export const taxiCreateSchema = z.object({
  vendor_id: z.number().nullable().optional(),
  pickup_datetime: z.string().nullable().optional(),
  dropoff_datetime: z.string().nullable().optional(),
  passenger_count: z.number().int().min(0).nullable().optional(),
  trip_distance: z.number().min(0).nullable().optional(),
  fare_amount: z.number().min(0).nullable().optional(),
  tip_amount: z.number().min(0).nullable().optional(),
  tolls_amount: z.number().min(0).nullable().optional(),
  mta_tax: z.number().min(0).nullable().optional(),
  extra: z.number().min(0).nullable().optional(),
  total_amount: z.number().min(0).nullable().optional(),
  payment_type: z.number().nullable().optional(),
  rate_code_id: z.number().nullable().optional(),
  store_and_fwd_flag: z.string().nullable().optional(),
  pickup_longitude: z.number().nullable().optional(),
  pickup_latitude: z.number().nullable().optional(),
  dropoff_longitude: z.number().nullable().optional(),
  dropoff_latitude: z.number().nullable().optional(),
});

export const taxiUpdateSchema = taxiCreateSchema.partial();

export const taxiResponseSchema = taxiCreateSchema.extend({
  id: z.number().int(),
  loaded_at: z.string(),
});

export type TaxiCreate = z.infer<typeof taxiCreateSchema>;
export type TaxiUpdate = z.infer<typeof taxiUpdateSchema>;
export type TaxiResponse = z.infer<typeof taxiResponseSchema>;
