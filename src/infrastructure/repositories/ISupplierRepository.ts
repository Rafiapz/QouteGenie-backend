import { SupplierEntity } from "../../domain/entities/supplier.entity";

export interface CreateSupplierData {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  organizationId: string;
}

export interface ISupplierRepository {
  create(data: CreateSupplierData): Promise<SupplierEntity>;
  findById(id: string, organizationId: string): Promise<SupplierEntity | null>;
  findByOrganizationId(organizationId: string): Promise<SupplierEntity[]>;
  findByName(name: string, organizationId: string): Promise<SupplierEntity | null>;
}
