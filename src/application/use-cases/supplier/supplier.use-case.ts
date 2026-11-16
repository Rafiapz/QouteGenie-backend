import { ISupplierRepository } from "../../../infrastructure/repositories/ISupplierRepository";
import { CreateSupplierDto, SupplierResponseDto } from "../../dtos/create-supplier.dto";
import { ConflictError, NotFoundError } from "../../../domain/errors/domain.error";

export interface CreateSupplierInput extends CreateSupplierDto {
  organizationId: string;
}

export class SupplierUseCase {
  constructor(private readonly supplierRepository: ISupplierRepository) {}

  async createSupplier(input: CreateSupplierInput): Promise<SupplierResponseDto> {
    const existing = await this.supplierRepository.findByName(
      input.name,
      input.organizationId
    );
    if (existing) {
      throw new ConflictError(
        `A supplier named "${input.name}" already exists in your organization.`
      );
    }

    const supplier = await this.supplierRepository.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address,
      organizationId: input.organizationId,
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

  async getSuppliers(organizationId: string): Promise<SupplierResponseDto[]> {
    const suppliers = await this.supplierRepository.findByOrganizationId(organizationId);

    return suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      organizationId: supplier.organizationId,
    }));
  }

  async getSupplierById(id: string, organizationId: string): Promise<SupplierResponseDto> {
    const supplier = await this.supplierRepository.findById(id, organizationId);
    if (!supplier) {
      throw new NotFoundError("Supplier", id);
    }

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
