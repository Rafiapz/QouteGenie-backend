export interface RiskItem {
  level: "low" | "medium" | "high";
  title: string;
  description: string;
  affectedSupplier: string;
}

export interface NegotiationLeveragePoint {
  supplierName: string;
  quoteNumber: string;
  leveragePoint: string;
  recommendedAction: string;
  potentialImpact: string;
  draftEmailSnippet?: string;
}

export interface SupplierScorecard {
  supplierId?: string;
  supplierName: string;
  quoteNumber: string;
  overallScore: number; // 0 - 100
  priceScore: number; // 0 - 100
  deliveryScore: number; // 0 - 100
  termsScore: number; // 0 - 100
  riskScore: number; // 0 - 100 (100 = lowest risk)
  strengths: string[];
  weaknesses: string[];
  missingItems?: string[];
  missingItemsCount?: number;
  totalScopeItemsCount?: number;
  itemCoveragePercent?: number;
  scopePenalized?: boolean;
}

export interface SplitSourcingAllocation {
  supplierName: string;
  itemDescription: string;
  suggestedQty: number;
  unitPrice: number;
  savingsVsHighest: number;
}

export interface SplitSourcingOpportunity {
  isRecommended: boolean;
  summary: string;
  potentialSavings: number;
  allocations: SplitSourcingAllocation[];
}

export interface IntelligentAnalysisResult {
  summary: string;
  recommendedSupplierName: string;
  recommendationReason: string;
  projectedSavings: number;
  strategicActionPlan: string[];
  splitSourcing: SplitSourcingOpportunity;
  riskAnalysis: RiskItem[];
  negotiationPoints: NegotiationLeveragePoint[];
  supplierScores: SupplierScorecard[];
  analyzedQuotesCount: number;
  generatedAt: string;
  isCached?: boolean;
  cacheExpiresInHours?: number;
}
