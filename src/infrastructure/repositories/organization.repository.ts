import { prisma } from "../database/prisma.client";
import {
  IOrganizationRepository,
  CreateOrganizationInput,
  OrganizationEntity,
} from "./IOrganizationRepository";

// Safe accessor that types organization delegate even if TS server cached stale definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as typeof prisma & { organization: any };

export class OrganizationRepository implements IOrganizationRepository {
  async create(data: CreateOrganizationInput): Promise<OrganizationEntity> {
    const created = await db.organization.create({
      data: {
        email: data.email,
        companyName: data.companyName,
        password: data.password,
        plan: data.plan ?? 1,
      },
    });

    return created as OrganizationEntity;
  }

  async findById(id: string): Promise<OrganizationEntity | null> {
    const found = await db.organization.findUnique({
      where: { id },
    });
    return (found as OrganizationEntity) || null;
  }

  async findByEmail(email: string): Promise<OrganizationEntity | null> {
    const found = await db.organization.findUnique({
      where: { email },
    });
    return (found as OrganizationEntity) || null;
  }
}
