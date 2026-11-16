import { prisma } from "../database/prisma.client";
import { SupplierEntity } from "../../domain/entities/supplier.entity";
import {
  ISupplierRepository,
  CreateSupplierData,
} from "./ISupplierRepository";

// Safe accessor that types supplier delegate even if TS server cached stale definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as typeof prisma & { supplier: any };

export class SupplierRepository implements ISupplierRepository {
  async create(data: CreateSupplierData): Promise<SupplierEntity> {
    const supplier = await db.supplier.create({
      data: {
        name: data.name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        organizationId: data.organizationId,
      },
    });

    return {
      id: supplier.id,
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      organizationId: supplier.organizationId,
    };
  }

  async findById(id: string, organizationId: string): Promise<SupplierEntity | null> {
    const supplier = await db.supplier.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!supplier) return null;

    return {
      id: supplier.id,
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      organizationId: supplier.organizationId,
    };
  }

  async findByOrganizationId(organizationId: string): Promise<SupplierEntity[]> {
    const suppliers = await db.supplier.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        name: "asc",
      },
    });

    return suppliers.map((supplier: any) => ({
      id: supplier.id,
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      organizationId: supplier.organizationId,
    }));
  }

  async findByName(name: string, organizationId: string): Promise<SupplierEntity | null> {
    const supplier = await db.supplier.findFirst({
      where: {
        organizationId,
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
    });

    if (!supplier) return null;

    return {
      id: supplier.id,
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      organizationId: supplier.organizationId,
    };
  }
}
