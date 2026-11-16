import { prisma } from "../database/prisma.client";
import { QuoteComparisonEntity } from "../../domain/entities/comparison.entity";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as typeof prisma & {
  quoteComparison: any;
};

export interface CreateComparisonInput {
  organizationId: string;
  name: string;
  description?: string | null;
  quoteIds: string[];
}

export interface UpdateComparisonInput {
  name?: string;
  description?: string | null;
  quoteIds?: string[];
}

export class ComparisonRepository {
  async create(data: CreateComparisonInput): Promise<QuoteComparisonEntity> {
    const record = await db.quoteComparison.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description ?? null,
        quoteIds: data.quoteIds,
      },
    });

    return this.mapToEntity(record);
  }

  async findAllByOrganization(organizationId: string): Promise<QuoteComparisonEntity[]> {
    const records = await db.quoteComparison.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
    });

    return records.map(this.mapToEntity);
  }

  async findById(id: string, organizationId: string): Promise<QuoteComparisonEntity | null> {
    const record = await db.quoteComparison.findFirst({
      where: { id, organizationId },
    });

    return record ? this.mapToEntity(record) : null;
  }

  async update(
    id: string,
    organizationId: string,
    data: UpdateComparisonInput
  ): Promise<QuoteComparisonEntity | null> {
    const existing = await db.quoteComparison.findFirst({
      where: { id, organizationId },
    });

    if (!existing) return null;

    const record = await db.quoteComparison.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.quoteIds !== undefined && { quoteIds: data.quoteIds }),
      },
    });

    return this.mapToEntity(record);
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const existing = await db.quoteComparison.findFirst({
      where: { id, organizationId },
    });

    if (!existing) return false;

    await db.quoteComparison.delete({
      where: { id },
    });

    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapToEntity(record: any): QuoteComparisonEntity {
    return {
      id: record.id,
      organizationId: record.organizationId,
      name: record.name,
      description: record.description ?? null,
      quoteIds: record.quoteIds || [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
