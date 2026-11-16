import { z } from "zod";

export const RegisterOrganizationSchema = z.object({
  email: z.string().email("Invalid email address format").max(255),
  companyName: z.string().min(1, "Company name is required").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(255, "Password cannot exceed 255 characters"),
  plan: z.number().int().min(1).default(1).optional(),
});

export type RegisterOrganizationDTO = z.infer<
  typeof RegisterOrganizationSchema
>;

export interface OrganizationResponseDTO {
  id: string;
  email: string;
  companyName: string;
  plan: number;
  createdAt: string;
  updatedAt: string;
  token?: string;
  tokenType?: string;
  expiresIn?: string;
}
