import jwt, { SignOptions } from "jsonwebtoken";
import { ITokenService, JwtUserPayload } from "./ITokenService";
import { env } from "../config/env.config";
import { UnauthorizedError } from "../../domain/errors/domain.error";

export class JwtTokenService implements ITokenService {
  private readonly secret: string;
  private readonly expiresIn: string;

  constructor(secret = env.JWT_SECRET, expiresIn = env.JWT_EXPIRES_IN) {
    this.secret = secret;
    this.expiresIn = expiresIn;
  }

  generateToken(payload: JwtUserPayload): string {
    const options: SignOptions = {
      expiresIn: this.expiresIn as SignOptions["expiresIn"],
    };
    return jwt.sign(payload, this.secret, options);
  }

  verifyToken(token: string): JwtUserPayload {
    try {
      const decoded = jwt.verify(token, this.secret);
      return decoded as JwtUserPayload;
    } catch {
      throw new UnauthorizedError("Invalid or expired authentication token.");
    }
  }
}
