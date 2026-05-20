import { z } from 'zod';

export const taxiCreateSchema = z.object({
  vendor_id: z.number().nullable().optional(),
  pickup_datetime: z.string().nullable().optional(),
  dropoff_datetime: z.string().nullable().optional(),
  passenger_count: z.number().nullable().optional(),
  trip_distance: z.number().nullable().optional(),
  fare_amount: z.number().nullable().optional(),
  tip_amount: z.number().nullable().optional(),
  tolls_amount: z.number().nullable().optional(),
  mta_tax: z.number().nullable().optional(),
  extra: z.number().nullable().optional(),
  total_amount: z.number().nullable().optional(),
  payment_type: z.number().nullable().optional(),
  rate_code_id: z.number().nullable().optional(),
  store_and_fwd_flag: z.string().nullable().optional(),
  pickup_longitude: z.number().nullable().optional(),
  pickup_latitude: z.number().nullable().optional(),
  dropoff_longitude: z.number().nullable().optional(),
  dropoff_latitude: z.number().nullable().optional(),
});

export const taxiUpdateSchema = taxiCreateSchema.partial();

export type TaxiCreate = z.infer<typeof taxiCreateSchema>;
export type TaxiUpdate = z.infer<typeof taxiUpdateSchema>;
