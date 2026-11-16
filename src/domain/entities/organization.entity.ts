export interface OrganizationEntity {
  id: string;
  email: string;
  companyName: string;
  plan: number;
  password?: string;
  createdAt: Date;
  updatedAt: Date;
}
