import { OrganizationEntity } from "../../domain/entities/organization.entity";

export interface CreateOrganizationInput {
  email: string;
  companyName: string;
  password: string;
  plan?: number;
}

export interface IOrganizationRepository {
  create(data: CreateOrganizationInput): Promise<OrganizationEntity>;
  findById(id: string): Promise<OrganizationEntity | null>;
  findByEmail(email: string): Promise<OrganizationEntity | null>;
}

export type { OrganizationEntity };
