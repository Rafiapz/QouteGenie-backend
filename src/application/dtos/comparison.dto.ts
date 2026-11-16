import { z } from "zod";

export const CreateComparisonSchema = z.object({
  name: z.string().trim().min(1, "Comparison name is required").max(255),
  description: z.string().trim().max(1000).optional().nullable(),
  quoteIds: z.array(z.string().uuid("Invalid quote ID")).min(1, "At least one quote ID must be specified"),
});

export const UpdateComparisonSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  quoteIds: z.array(z.string().uuid("Invalid quote ID")).min(1).optional(),
});

export type CreateComparisonDto = z.infer<typeof CreateComparisonSchema>;
export type UpdateComparisonDto = z.infer<typeof UpdateComparisonSchema>;
