export interface JwtUserPayload {
  organizationId: string;
  email: string;
  companyName: string;
  plan: number;
}

export interface ITokenService {
  generateToken(payload: JwtUserPayload): string;
  verifyToken(token: string): JwtUserPayload;
}
