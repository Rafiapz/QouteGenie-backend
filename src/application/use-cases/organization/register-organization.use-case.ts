import { IOrganizationRepository } from "../../../infrastructure/repositories/IOrganizationRepository";
import { IPasswordHasher } from "../../../infrastructure/security/IPasswordHasher";
import { ITokenService } from "../../../infrastructure/security/ITokenService";
import { ConflictError } from "../../../domain/errors/domain.error";
import {
  RegisterOrganizationDTO,
  OrganizationResponseDTO,
} from "../../dtos/register-organization.dto";

export class RegisterOrganizationUseCase {
  constructor(
    private readonly organizationRepository: IOrganizationRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService?: ITokenService
  ) {}

  async execute(dto: RegisterOrganizationDTO): Promise<OrganizationResponseDTO> {
    // 1. Check if an organization with the same email already exists
    const existingOrg = await this.organizationRepository.findByEmail(dto.email);
    if (existingOrg) {
      throw new ConflictError(`An organization with email "${dto.email}" already exists.`);
    }

    // 2. Securely hash password
    const hashedPassword = await this.passwordHasher.hash(dto.password);

    // 3. Persist organization via repository contract
    const organization = await this.organizationRepository.create({
      email: dto.email.toLowerCase().trim(),
      companyName: dto.companyName.trim(),
      password: hashedPassword,
      plan: dto.plan ?? 1,
    });

    // 4. Generate JWT token if token service is injected
    const token = this.tokenService
      ? this.tokenService.generateToken({
          organizationId: organization.id,
          email: organization.email,
          companyName: organization.companyName,
          plan: organization.plan,
        })
      : undefined;

    // 5. Return sanitized response (never expose password)
    return {
      id: organization.id,
      email: organization.email,
      companyName: organization.companyName,
      plan: organization.plan,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
      ...(token && {
        token,
        tokenType: "Bearer",
        expiresIn: "1d",
      }),
    };
  }
}
