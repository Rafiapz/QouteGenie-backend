export interface QuoteComparisonEntity {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  quoteIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
