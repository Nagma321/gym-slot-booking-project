const { z } = require('zod');

const createBookingSchema = z.object({
  slotId: z.union([z.string(), z.number()]).refine(
    (v) => Number.isInteger(Number(v)) && Number(v) > 0,
    { message: 'slotId must be a positive integer' }
  ),
});

const paginationSchema = z.object({
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined ? 1 : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= 1, 'page must be a positive integer'),
  pageSize: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined ? 20 : Number(v)))
    .refine(
      (v) => Number.isInteger(v) && v >= 1 && v <= 100,
      'pageSize must be between 1 and 100'
    ),
});

module.exports = { createBookingSchema, paginationSchema };
