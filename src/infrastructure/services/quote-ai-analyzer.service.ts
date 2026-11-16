import crypto from "crypto";
import OpenAI from "openai";
import { SupplierQuoteEntity } from "../../domain/entities/quote.entity";
import {
  IntelligentAnalysisResult,
  SupplierScorecard,
  RiskItem,
  NegotiationLeveragePoint,
  SplitSourcingOpportunity,
} from "../../domain/entities/quote-analysis.entity";
import { redisClient } from "../cache/redis.client";

export class QuoteAiAnalyzerService {
  private openai: OpenAI | null = null;

  constructor() {
    this.getOpenAIClient();
  }

  private getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      this.openai = null;
      return null;
    }

    if (!this.openai || this.openai.apiKey !== apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
      });
    }
    return this.openai;
  }

  private computeCacheKey(organizationId: string, quotes: SupplierQuoteEntity[]): string {
    const quoteFingerprints = quotes
      .map((q) => `${q.id}:${q.quoteNumber}:${q.totalAmount}:${q.updatedAt?.getTime?.() || 0}`)
      .sort()
      .join("|");
    const hash = crypto.createHash("sha256").update(quoteFingerprints).digest("hex").slice(0, 16);
    return `quote_analysis:${organizationId}:${hash}`;
  }

  async analyzeQuotations(
    quotes: SupplierQuoteEntity[],
    organizationId: string = "default",
    forceRefresh: boolean = false
  ): Promise<IntelligentAnalysisResult> {
    if (!quotes || quotes.length === 0) {
      throw new Error("No quotations provided for intelligent analysis.");
    }

    const cacheKey = this.computeCacheKey(organizationId, quotes);

    // 1. Check Redis Cache if not forcing refresh
    if (!forceRefresh) {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as IntelligentAnalysisResult;
          parsed.isCached = true;
          console.log(`⚡ Served Intelligent Quotation Analysis from Redis cache [${cacheKey}]`);
          return parsed;
        } catch (err) {
          console.warn("Failed to parse cached Redis JSON:", err);
        }
      }
    } else {
      console.log(`Bypassing cache for fresh AI quotation analysis [${cacheKey}]`);
    }

    let result: IntelligentAnalysisResult | null = null;

    // 2. Run AI extraction via Groq / OpenAI
    const aiClient = this.getOpenAIClient();
    if (aiClient) {
      try {
        console.log(`Running Intelligent Quotation Analysis via AI for ${quotes.length} quotations...`);
        result = await this.runAiAnalysis(quotes);
      } catch (err) {
        console.warn("AI analysis service encountered an error; falling back to heuristic analyzer:", err);
      }
    }

    // 3. Fallback: Intelligent heuristic algorithmic analysis if AI not available
    if (!result) {
      result = this.runHeuristicAnalysis(quotes);
    }

    // 4. Save analysis to Upstash Redis with 24-hour TTL (86400 seconds)
    if (result) {
      result.isCached = false;
      result.cacheExpiresInHours = 24;
      await redisClient.set(cacheKey, JSON.stringify(result), 86400);
      console.log(`💾 Stored fresh analysis in Upstash Redis cache (TTL: 24h) [${cacheKey}]`);
    }

    return result;
  }

  private async runAiAnalysis(quotes: SupplierQuoteEntity[]): Promise<IntelligentAnalysisResult | null> {
    if (!this.openai) return null;

    const candidateModels = Array.from(
      new Set(
        [
          process.env.OPENAI_MODEL?.trim(),
          "openai/gpt-oss-120b",
          "qwen/qwen3.8-27b",
          "openai/gpt-oss-20b",
          "gpt-4o-mini",
        ].filter(Boolean) as string[]
      )
    );

    const quotesSummary = quotes.map((q) => ({
      quoteId: q.id,
      quoteNumber: q.quoteNumber,
      supplierName: q.supplier?.name || "Supplier",
      quoteDate: q.quoteDate,
      validUntil: q.validUntil,
      currency: q.currency,
      leadTime: q.deliveryLeadTime,
      paymentTerms: q.paymentTerms,
      subtotal: q.totalAmount ? Number(q.totalAmount) - Number(q.taxAmount || 0) : 0,
      taxAmount: Number(q.taxAmount || 0),
      totalAmount: Number(q.totalAmount || 0),
      notes: q.notes,
      items: (q.quoteLines || []).map((l) => ({
        partNumber: l.partNumber,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        price: Number(l.price),
        totalPrice: Number(l.totalPrice || l.quantity * Number(l.price)),
      })),
    }));

    const prompt = `You are a World-Class Chief Procurement Officer (CPO) and Strategic Sourcing Analyst.
Perform an in-depth, executive-grade procurement analysis on the following supplier quotations.

Provide strategic sourcing recommendations, item-level split-sourcing opportunities, contractual risks & hidden cost clauses, tactical negotiation leverage battlecards, and detailed supplier scorecards.

Strictly return valid JSON following this schema:
{
  "summary": "High-level executive summary of the quotation landscape and market dynamics (2-3 sentences)",
  "recommendedSupplierName": "Name of the overall recommended supplier",
  "recommendationReason": "Comprehensive explanation of why this supplier is the optimal choice considering price, lead time, and risk",
  "projectedSavings": 1234.50 (numeric projected savings vs highest quote or baseline),
  "strategicActionPlan": [
    "Step 1: Next immediate procurement action",
    "Step 2: Commercial term adjustment to demand",
    "Step 3: Contract award and milestone setup"
  ],
  "splitSourcing": {
    "isRecommended": boolean (true if purchasing specific items from different suppliers yields significant savings),
    "summary": "Explanation of the multi-vendor sourcing strategy vs single vendor award",
    "potentialSavings": 123.45 (additional numeric savings achievable by split sourcing),
    "allocations": [
      {
        "supplierName": "Supplier Name",
        "itemDescription": "Part / Description to buy from them",
        "suggestedQty": 100,
        "unitPrice": 12.50,
        "savingsVsHighest": 45.00
      }
    ]
  },
  "riskAnalysis": [
    {
      "level": "high" | "medium" | "low",
      "title": "Short title of risk (e.g. Short Validity Window, Harsh Payment Terms, Freight Uninsured)",
      "description": "Specific impact and risk explanation",
      "affectedSupplier": "Supplier Name"
    }
  ],
  "negotiationPoints": [
    {
      "supplierName": "Supplier Name",
      "quoteNumber": "Quote Number",
      "leveragePoint": "Specific fact or competitive benchmark to bring to the table",
      "recommendedAction": "Actionable tactic (e.g. 'Request price match on Part X or ask for Net-45 credit')",
      "potentialImpact": "Estimated financial or operational gain",
      "draftEmailSnippet": "Short polite 2-sentence draft email snippet the buyer can send"
    }
  ],
  "supplierScores": [
    {
      "supplierName": "Supplier Name",
      "quoteNumber": "Quote Number",
      "overallScore": 85 (0-100),
      "priceScore": 90 (0-100),
      "deliveryScore": 80 (0-100),
      "termsScore": 85 (0-100),
      "riskScore": 85 (0-100, higher means safer/lower risk),
      "strengths": ["Key competitive advantage 1", "Key advantage 2"],
      "weaknesses": ["Key weakness or gap 1"]
    }
  ]
}

Quotations Data:
"""
${JSON.stringify(quotesSummary, null, 2)}
"""`;

    let content: string | null = null;
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        const response = await this.openai.chat.completions.create({
          model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "You are a professional procurement AI that produces accurate, executive-level JSON analysis only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
        });

        content = response.choices[0]?.message?.content || null;
        if (content) {
          console.log(`Intelligent AI analysis generated successfully using model: ${model}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        if (err.code === "model_not_found" || err.status === 404) {
          console.warn(`Model ${model} not available, rotating to next candidate...`);
          continue;
        }
        throw err;
      }
    }

    if (!content) {
      if (lastError) throw lastError;
      return null;
    }

    const parsed = JSON.parse(content);

    return {
      summary: String(parsed.summary || "Procurement quotation analysis complete."),
      recommendedSupplierName: String(parsed.recommendedSupplierName || quotes[0].supplier?.name || "Supplier"),
      recommendationReason: String(parsed.recommendationReason || "Evaluated best price-to-lead-time ratio."),
      projectedSavings: Number(parsed.projectedSavings) || 0,
      strategicActionPlan: Array.isArray(parsed.strategicActionPlan)
        ? parsed.strategicActionPlan.map(String)
        : ["Review vendor line-item pricing", "Counter-offer lead supplier", "Execute formal PO"],
      splitSourcing: {
        isRecommended: Boolean(parsed.splitSourcing?.isRecommended),
        summary: String(parsed.splitSourcing?.summary || "Single-vendor award recommended to minimize supplier overhead."),
        potentialSavings: Number(parsed.splitSourcing?.potentialSavings) || 0,
        allocations: Array.isArray(parsed.splitSourcing?.allocations)
          ? parsed.splitSourcing.allocations.map((a: any) => ({
              supplierName: String(a.supplierName || "Supplier"),
              itemDescription: String(a.itemDescription || "Item"),
              suggestedQty: Number(a.suggestedQty) || 1,
              unitPrice: Number(a.unitPrice) || 0,
              savingsVsHighest: Number(a.savingsVsHighest) || 0,
            }))
          : [],
      },
      riskAnalysis: Array.isArray(parsed.riskAnalysis)
        ? parsed.riskAnalysis.map((r: any) => ({
            level: ["low", "medium", "high"].includes(String(r.level).toLowerCase())
              ? (String(r.level).toLowerCase() as "low" | "medium" | "high")
              : "medium",
            title: String(r.title || "Contractual Term"),
            description: String(r.description || ""),
            affectedSupplier: String(r.affectedSupplier || quotes[0].supplier?.name || "Supplier"),
          }))
        : [],
      negotiationPoints: Array.isArray(parsed.negotiationPoints)
        ? parsed.negotiationPoints.map((n: any) => ({
            supplierName: String(n.supplierName || "Supplier"),
            quoteNumber: String(n.quoteNumber || "Quote"),
            leveragePoint: String(n.leveragePoint || ""),
            recommendedAction: String(n.recommendedAction || ""),
            potentialImpact: String(n.potentialImpact || ""),
            draftEmailSnippet: n.draftEmailSnippet ? String(n.draftEmailSnippet) : undefined,
          }))
        : [],
      supplierScores: Array.isArray(parsed.supplierScores)
        ? parsed.supplierScores.map((s: any) => ({
            supplierName: String(s.supplierName || "Supplier"),
            quoteNumber: String(s.quoteNumber || "Quote"),
            overallScore: Math.min(100, Math.max(0, Number(s.overallScore) || 80)),
            priceScore: Math.min(100, Math.max(0, Number(s.priceScore) || 80)),
            deliveryScore: Math.min(100, Math.max(0, Number(s.deliveryScore) || 80)),
            termsScore: Math.min(100, Math.max(0, Number(s.termsScore) || 80)),
            riskScore: Math.min(100, Math.max(0, Number(s.riskScore) || 80)),
            strengths: Array.isArray(s.strengths) ? s.strengths.map(String) : [],
            weaknesses: Array.isArray(s.weaknesses) ? s.weaknesses.map(String) : [],
          }))
        : [],
      analyzedQuotesCount: quotes.length,
      generatedAt: new Date().toISOString(),
    };
  }

  private runHeuristicAnalysis(quotes: SupplierQuoteEntity[]): IntelligentAnalysisResult {
    const sortedByPrice = [...quotes].sort(
      (a, b) => Number(a.totalAmount || 0) - Number(b.totalAmount || 0)
    );
    const cheapest = sortedByPrice[0];
    const highest = sortedByPrice[sortedByPrice.length - 1];

    const projectedSavings =
      Number(highest.totalAmount || 0) - Number(cheapest.totalAmount || 0);

    const riskAnalysis: RiskItem[] = [];
    const negotiationPoints: NegotiationLeveragePoint[] = [];
    const supplierScores: SupplierScorecard[] = [];

    // Analyze each quote
    quotes.forEach((q) => {
      const supplierName = q.supplier?.name || "Supplier";
      const totalAmount = Number(q.totalAmount || 0);
      const isCheapest = q.id === cheapest.id;

      // Check payment terms risk
      const terms = (q.paymentTerms || "").toLowerCase();
      if (terms.includes("immediate") || terms.includes("advance") || terms.includes("100%")) {
        riskAnalysis.push({
          level: "high",
          title: "Rigid Advance Payment Terms",
          description: `${supplierName} requests ${q.paymentTerms}. This increases cash flow strain and buyer exposure.`,
          affectedSupplier: supplierName,
        });
      }

      // Check validity expiration risk
      if (q.validUntil) {
        const daysLeft = Math.ceil((new Date(q.validUntil).getTime() - Date.now()) / (1000 * 3600 * 24));
        if (daysLeft < 7 && daysLeft >= 0) {
          riskAnalysis.push({
            level: "medium",
            title: "Urgent Quotation Expiry Window",
            description: `Quote ${q.quoteNumber} expires in ${daysLeft} days (${new Date(q.validUntil).toISOString().split("T")[0]}). Requires prompt PO issuance to lock pricing.`,
            affectedSupplier: supplierName,
          });
        }
      }

      // Negotiation point
      if (!isCheapest && projectedSavings > 0) {
        negotiationPoints.push({
          supplierName,
          quoteNumber: q.quoteNumber,
          leveragePoint: `Price is higher than lowest benchmark by ${formatCurrency(totalAmount - Number(cheapest.totalAmount || 0))}`,
          recommendedAction: `Ask ${supplierName} for a competitive volume discount to match the lead bid.`,
          potentialImpact: `Potential price reduction of up to ${formatCurrency(totalAmount - Number(cheapest.totalAmount || 0))}.`,
          draftEmailSnippet: `We have reviewed quotation ${q.quoteNumber}. While we appreciate your proposal, your quote is currently above alternative qualified vendors. Could you offer an improved volume rate?`,
        });
      }

      // Scorecard
      const priceScore = Math.max(50, Math.round(100 - ((totalAmount - Number(cheapest.totalAmount || 0)) / (Number(highest.totalAmount || 1))) * 40));
      const deliveryScore = 85;
      const termsScore = terms.includes("net 30") || terms.includes("net 45") ? 90 : 70;
      const riskScore = terms.includes("immediate") ? 65 : 85;
      const overallScore = Math.round((priceScore * 0.45) + (deliveryScore * 0.25) + (termsScore * 0.15) + (riskScore * 0.15));

      supplierScores.push({
        supplierName,
        quoteNumber: q.quoteNumber,
        overallScore,
        priceScore,
        deliveryScore,
        termsScore,
        riskScore,
        strengths: isCheapest ? ["Lowest total cost bid", "High cost-efficiency"] : ["Comprehensive specification match"],
        weaknesses: !isCheapest ? ["Priced above market benchmark"] : [],
      });
    });

    return {
      summary: `Analyzed ${quotes.length} quotations. ${cheapest.supplier?.name || "The leading vendor"} presents the most cost-effective solution with total projected savings of ${formatCurrency(projectedSavings)}.`,
      recommendedSupplierName: cheapest.supplier?.name || "Supplier",
      recommendationReason: `Delivers the lowest overall procurement expenditure of ${formatCurrency(Number(cheapest.totalAmount || 0))} with standard commercial compliance.`,
      projectedSavings,
      strategicActionPlan: [
        `Confirm order allocation with ${cheapest.supplier?.name || "recommended vendor"} before validity expiration`,
        "Request formal payment terms confirmation (Net-30 days)",
        "Lock in delivery milestones against agreed purchase order",
      ],
      splitSourcing: {
        isRecommended: false,
        summary: "Single-vendor award to the lead supplier is recommended to maintain single point of contact and volume leverage.",
        potentialSavings: 0,
        allocations: [],
      },
      riskAnalysis,
      negotiationPoints,
      supplierScores,
      analyzedQuotesCount: quotes.length,
      generatedAt: new Date().toISOString(),
    };
  }
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}
