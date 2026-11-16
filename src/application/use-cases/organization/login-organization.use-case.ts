import { IOrganizationRepository } from "../../../infrastructure/repositories/IOrganizationRepository";
import { IPasswordHasher } from "../../../infrastructure/security/IPasswordHasher";
import { ITokenService } from "../../../infrastructure/security/ITokenService";
import {
  LoginOrganizationInput,
  LoginOrganizationOutput,
} from "../../dtos/login-organization.dto";
import { UnauthorizedError } from "../../../domain/errors/domain.error";

export class LoginOrganizationUseCase {
  constructor(
    private readonly organizationRepository: IOrganizationRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: ITokenService
  ) {}

  async execute(input: LoginOrganizationInput): Promise<LoginOrganizationOutput> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Find organization by email
    const org = await this.organizationRepository.findByEmail(normalizedEmail);
    if (!org || !org.password) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    // 2. Compare password with stored bcrypt hash
    const isPasswordValid = await this.passwordHasher.compare(
      input.password,
      org.password
    );

    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password.");
    }

    // 3. Generate JWT token with 1-day expiration
    const token = this.tokenService.generateToken({
      organizationId: org.id,
      email: org.email,
      companyName: org.companyName,
      plan: org.plan,
    });

    const createdAtIso = org.createdAt.toISOString();

    // 4. Return sanitized organization credentials and JWT token
    return {
      id: org.id,
      email: org.email,
      companyName: org.companyName,
      plan: org.plan,
      createdAt: createdAtIso,
      token,
      tokenType: "Bearer",
      expiresIn: "1d",
      organization: {
        id: org.id,
        email: org.email,
        companyName: org.companyName,
        plan: org.plan,
        createdAt: createdAtIso,
      },
    };
  }
}
