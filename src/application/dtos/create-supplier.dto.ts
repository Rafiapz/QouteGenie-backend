import { z } from "zod";

export const CreateSupplierSchema = z
  .object({
    name: z
      .string({ required_error: "Supplier name is required" })
      .trim()
      .min(2, { message: "Supplier name must be at least 2 characters" })
      .max(255, { message: "Supplier name cannot exceed 255 characters" }),
    email: z
      .string()
      .trim()
      .email({ message: "Invalid email address format" })
      .max(255, { message: "Email cannot exceed 255 characters" })
      .toLowerCase()
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    phone: z
      .string()
      .trim()
      .max(50, { message: "Phone number cannot exceed 50 characters" })
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    address: z
      .string()
      .trim()
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
  })
  .strict();

export type CreateSupplierDto = z.infer<typeof CreateSupplierSchema>;

export interface SupplierResponseDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  organizationId: string;
}
