import { z } from "zod";

export const LoginOrganizationSchema = z
  .object({
    email: z
      .string({ required_error: "Work email is required" })
      .trim()
      .toLowerCase()
      .email("Please provide a valid work email address")
      .max(255, "Email address cannot exceed 255 characters"),
    password: z
      .string({ required_error: "Password is required" })
      .min(1, "Password is required")
      .max(72, "Password cannot exceed 72 characters"),
  })
  .strict();

export type LoginOrganizationInput = z.infer<typeof LoginOrganizationSchema>;

export interface LoginOrganizationOutput {
  id: string;
  email: string;
  companyName: string;
  plan: number;
  createdAt: string;
  token: string;
  tokenType: string;
  expiresIn: string;
  organization: {
    id: string;
    email: string;
    companyName: string;
    plan: number;
    createdAt: string;
  };
}
