import { z } from "zod";

export const QuoteLineSchema = z.object({
  partNumber: z.string().trim().min(1, "Part number is required"),
  description: z.string().trim().optional().nullable(),
  quantity: z.number().int().positive("Quantity must be greater than 0"),
  unit: z.string().trim().default("units"),
  price: z.number().min(0, "Price must be greater than or equal to 0"),
  totalPrice: z.number().min(0).optional(),
});

export const SaveQuoteSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier ID").optional(),
  supplierName: z.string().trim().min(1, "Supplier name is required"),
  quoteNumber: z.string().trim().min(1, "Quote number is required"),
  quoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Quote date must be YYYY-MM-DD"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Valid until date must be YYYY-MM-DD").optional().nullable(),
  currency: z.string().trim().length(3).default("INR"),
  deliveryLeadTime: z.string().trim().optional().nullable(),
  paymentTerms: z.string().trim().optional().nullable(),
  totalAmount: z.number().optional().nullable(),
  taxAmount: z.number().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  uploadedFileId: z.string().uuid().optional().nullable(),
  lines: z.array(QuoteLineSchema).min(1, "At least one quote line is required"),
});

export type SaveQuoteDto = z.infer<typeof SaveQuoteSchema>;

export const AnalyzeQuotesSchema = z.object({
  quoteIds: z.array(z.string()).optional(),
  forceRefresh: z.boolean().optional(),
});

export type AnalyzeQuotesDto = z.infer<typeof AnalyzeQuotesSchema>;
