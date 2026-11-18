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
      try {
        await redisClient.del(cacheKey);
      } catch (delErr) {
        console.warn("Failed to delete stale cache on forceRefresh:", delErr);
      }
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

  async invalidateQuotesAnalysis(
    quotes: SupplierQuoteEntity[],
    organizationId: string = "default"
  ): Promise<void> {
    const cacheKey = this.computeCacheKey(organizationId, quotes);
    await redisClient.del(cacheKey);
    console.log(`🗑️ Removed quotation analysis from Redis cache [${cacheKey}]`);
  }

  private async runAiAnalysis(quotes: SupplierQuoteEntity[]): Promise<IntelligentAnalysisResult | null> {
    if (!this.openai) return null;

    const { totalScopeItems, quoteMissingMap } = extractCrossQuoteItemScope(quotes);

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

    const quotesSummary = quotes.map((q) => {
      const missingItems = quoteMissingMap.get(q.id) || [];
      const quotedCount = (q.quoteLines || []).length;
      return {
        quoteId: q.id,
        quoteNumber: q.quoteNumber,
        supplierName: q.supplier?.name || "Supplier",
        quoteDate: q.quoteDate,
        validUntil: q.validUntil,
        currency: "INR",
        leadTime: q.deliveryLeadTime,
        paymentTerms: q.paymentTerms,
        subtotal: q.totalAmount ? Number(q.totalAmount) - Number(q.taxAmount || 0) : 0,
        taxAmount: Number(q.taxAmount || 0),
        totalAmount: Number(q.totalAmount || 0),
        notes: q.notes,
        totalScopeItemsRequired: totalScopeItems,
        itemsQuotedCount: quotedCount,
        hasMissingItems: missingItems.length > 0,
        missingItemsComparedToOthers: missingItems,
        scopeCoveragePercent:
          totalScopeItems > 0 ? Math.round((quotedCount / totalScopeItems) * 100) : 100,
        items: (q.quoteLines || []).map((l) => ({
          partNumber: l.partNumber,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          price: Number(l.price),
          totalPrice: Number(l.totalPrice || l.quantity * Number(l.price)),
        })),
      };
    });

    const prompt = `You are a World-Class Chief Procurement Officer (CPO) and Strategic Sourcing Analyst.
Perform an in-depth, executive-grade procurement analysis on the following supplier quotations.

Provide strategic sourcing recommendations, item-level split-sourcing opportunities, contractual risks & hidden cost clauses, tactical negotiation leverage battlecards, and detailed supplier scorecards.

CRITICAL PROCUREMENT SCOPE COMPLETENESS & SCORECARD DIRECTIVE:
0. STRICT CURRENCY MANDATE: ALL prices, monetary amounts, baseline figures, and projected savings MUST be stated exclusively in Indian Rupees (₹ / INR). NEVER use $, USD, EUR, GBP, or other currencies anywhere in summary, recommendationReason, allocations, or text.
1. YOU MUST SCORE ALL ${quotes.length} SUPPLIER QUOTATIONS: The "supplierScores" array MUST contain EXACTLY ${quotes.length} scorecards — one distinct scorecard for every quotation listed below:
${quotes.map((q, idx) => `   ${idx + 1}. Supplier: "${q.supplier?.name || "Supplier"}", Quote Number: "${q.quoteNumber}"`).join("\n")}
   DO NOT omit, truncate, or combine any supplier from "supplierScores". Every single quote must receive its own scorecard.
2. In the supplier's scorecard, you MUST include the "missingItems" array listing all omitted items (hasMissingItems=true or missingItemsComparedToOthers not empty).
3. Incomplete item scope is a SEVERE FULFILLMENT RISK because an incomplete quotation's total price looks artificially low.
4. You MUST heavily PENALIZE both overallScore (deduct 15-35 points based on missing ratio) and riskScore (drop to 40-60) for any quotation with missing items.
5. You MUST state the missing items in the supplier's "weaknesses" list (e.g. "Incomplete scope: Missing Item X, Item Y").
6. DO NOT recommend an incomplete quotation as the overall winner ("recommendedSupplierName") over a supplier that quoted the complete scope, unless split-sourcing explicitly covers the missing scope.

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
      "title": "Short title of risk (e.g. Incomplete Item Scope, Short Validity Window, Harsh Payment Terms)",
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
      "overallScore": 85 (0-100, heavily penalized if missing items),
      "priceScore": 90 (0-100),
      "deliveryScore": 80 (0-100),
      "termsScore": 85 (0-100),
      "riskScore": 85 (0-100, heavily penalized if missing items),
      "missingItems": ["Item Description 1", "Item Description 2"],
      "missingItemsCount": 2,
      "itemCoveragePercent": 66,
      "strengths": ["Key competitive advantage 1", "Key advantage 2"],
      "weaknesses": ["Key weakness or gap 1", "Missing items: Item Description 1"]
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
      supplierScores: (() => {
        const rawAiScores = Array.isArray(parsed.supplierScores) ? parsed.supplierScores : [];
        const aiScoreMap = new Map<string, any>();

        rawAiScores.forEach((s: any) => {
          const qNum = String(s.quoteNumber || "").trim().toLowerCase();
          const sName = String(s.supplierName || "").trim().toLowerCase();
          if (qNum) aiScoreMap.set(qNum, s);
          if (sName && !aiScoreMap.has(sName)) aiScoreMap.set(sName, s);
        });

        // Compute baseline stats for score synthesizing in case AI omitted any quotes
        const completeQuotes = quotes.filter((q) => {
          const missing = quoteMissingMap.get(q.id) || [];
          return missing.length === 0;
        });
        const candidatePool = completeQuotes.length > 0 ? completeQuotes : quotes;
        const sortedByPrice = [...candidatePool].sort(
          (a, b) => Number(a.totalAmount || 0) - Number(b.totalAmount || 0)
        );
        const baselineWinner = sortedByPrice[0] || quotes[0];
        const allSorted = [...quotes].sort(
          (a, b) => Number(a.totalAmount || 0) - Number(b.totalAmount || 0)
        );
        const highestBid = allSorted[allSorted.length - 1] || quotes[0];

        // Ensure EVERY quotation has a scorecard
        return quotes.map((q) => {
          const qNum = (q.quoteNumber || "").trim().toLowerCase();
          const sName = (q.supplier?.name || "").trim().toLowerCase();
          const matched = aiScoreMap.get(qNum) || aiScoreMap.get(sName);

          const missing =
            quoteMissingMap.get(q.id) ||
            quoteMissingMap.get(qNum) ||
            quoteMissingMap.get(sName) ||
            [];
          const hasMissing = missing.length > 0 && totalScopeItems > 1;
          const coverageRatio =
            totalScopeItems > 0 ? (totalScopeItems - missing.length) / totalScopeItems : 1;
          const scopePenalty = hasMissing ? Math.round((1 - coverageRatio) * 35) : 0;

          if (matched) {
            let rawOverall = Math.min(100, Math.max(0, Number(matched.overallScore) || 80));
            let rawRisk = Math.min(100, Math.max(0, Number(matched.riskScore) || 80));
            let rawPrice = Math.min(100, Math.max(0, Number(matched.priceScore) || 80));
            let isPenalized = false;

            if (hasMissing) {
              rawOverall = Math.max(15, Math.min(rawOverall, 100 - scopePenalty));
              rawRisk = Math.max(15, Math.min(rawRisk, 100 - scopePenalty));
              rawPrice = Math.round(rawPrice * Math.min(1, coverageRatio + 0.15));
              isPenalized = true;
            }

            const strengths = Array.isArray(matched.strengths) ? matched.strengths.map(String) : [];
            const weaknesses = Array.isArray(matched.weaknesses) ? matched.weaknesses.map(String) : [];

            if (hasMissing) {
              if (!weaknesses.some((w: string) => w.toLowerCase().includes("missing") || w.toLowerCase().includes("incomplete"))) {
                weaknesses.unshift(
                  `Incomplete scope: Missing ${missing.length} item(s) (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""})`
                );
              }
            } else if (totalScopeItems > 1 && !strengths.some((st: string) => st.toLowerCase().includes("complete"))) {
              strengths.unshift(
                `100% Complete item scope (${totalScopeItems}/${totalScopeItems} items quoted)`
              );
            }

            return {
              supplierName: q.supplier?.name || String(matched.supplierName || "Supplier"),
              quoteNumber: q.quoteNumber || String(matched.quoteNumber || "Quote"),
              overallScore: rawOverall,
              priceScore: rawPrice,
              deliveryScore: Math.min(100, Math.max(0, Number(matched.deliveryScore) || 80)),
              termsScore: Math.min(100, Math.max(0, Number(matched.termsScore) || 80)),
              riskScore: rawRisk,
              strengths,
              weaknesses,
              missingItems: missing,
              missingItemsCount: missing.length,
              totalScopeItemsCount: totalScopeItems,
              itemCoveragePercent: totalScopeItems > 0 ? Math.round(coverageRatio * 100) : 100,
              scopePenalized: isPenalized,
            };
          }

          // Fallback scorecard generation if AI omitted this specific quotation from supplierScores
          const totalAmount = Number(q.totalAmount || 0);
          const rawPriceScore = Math.max(
            40,
            Math.round(
              100 -
                ((totalAmount - Number(baselineWinner.totalAmount || 0)) /
                  Number(highestBid.totalAmount || 1)) *
                  40
            )
          );
          const priceScore = hasMissing
            ? Math.round(rawPriceScore * Math.min(1, coverageRatio + 0.15))
            : rawPriceScore;
          const deliveryScore = 85;
          const terms = (q.paymentTerms || "").toLowerCase();
          const termsScore = terms.includes("net 30") || terms.includes("net 45") ? 90 : 70;
          const riskScore = Math.max(
            20,
            (terms.includes("immediate") ? 65 : 85) - (hasMissing ? 25 : 0)
          );
          const rawOverall = Math.round(
            priceScore * 0.45 + deliveryScore * 0.25 + termsScore * 0.15 + riskScore * 0.15
          );
          const overallScore = Math.max(15, Math.min(100, rawOverall - scopePenalty));

          const strengths: string[] = [];
          if (!hasMissing && totalScopeItems > 1) {
            strengths.push(`Complete item scope (${totalScopeItems}/${totalScopeItems} items quoted)`);
          } else {
            strengths.push("Competitive initial line pricing");
          }

          const weaknesses: string[] = [];
          if (hasMissing) {
            weaknesses.push(`Missing ${missing.length} item(s): ${missing.slice(0, 3).join(", ")}`);
          }

          return {
            supplierName: q.supplier?.name || "Supplier",
            quoteNumber: q.quoteNumber,
            overallScore,
            priceScore,
            deliveryScore,
            termsScore,
            riskScore,
            strengths,
            weaknesses,
            missingItems: missing,
            missingItemsCount: missing.length,
            totalScopeItemsCount: totalScopeItems,
            itemCoveragePercent: Math.round(coverageRatio * 100),
            scopePenalized: hasMissing,
          };
        });
      })(),
      analyzedQuotesCount: quotes.length,
      generatedAt: new Date().toISOString(),
    };
  }

  private runHeuristicAnalysis(quotes: SupplierQuoteEntity[]): IntelligentAnalysisResult {
    const { totalScopeItems, quoteMissingMap } = extractCrossQuoteItemScope(quotes);

    // Identify complete quotes vs incomplete quotes
    const completeQuotes = quotes.filter((q) => {
      const missing = quoteMissingMap.get(q.id) || [];
      return missing.length === 0;
    });

    // When sorting for recommended baseline, prefer complete quotes if any exist
    const candidatePool = completeQuotes.length > 0 ? completeQuotes : quotes;
    const sortedByPrice = [...candidatePool].sort(
      (a, b) => Number(a.totalAmount || 0) - Number(b.totalAmount || 0)
    );
    const recommendedWinner = sortedByPrice[0];

    const allSorted = [...quotes].sort(
      (a, b) => Number(a.totalAmount || 0) - Number(b.totalAmount || 0)
    );
    const absoluteLowest = allSorted[0];
    const highest = allSorted[allSorted.length - 1];

    const projectedSavings = Math.max(
      0,
      Number(highest.totalAmount || 0) - Number(recommendedWinner.totalAmount || 0)
    );

    const riskAnalysis: RiskItem[] = [];
    const negotiationPoints: NegotiationLeveragePoint[] = [];
    const supplierScores: SupplierScorecard[] = [];

    // Analyze each quote
    quotes.forEach((q) => {
      const supplierName = q.supplier?.name || "Supplier";
      const totalAmount = Number(q.totalAmount || 0);
      const isWinner = q.id === recommendedWinner.id;
      const isAbsoluteLowest = q.id === absoluteLowest.id;
      const missing = quoteMissingMap.get(q.id) || [];
      const hasMissing = missing.length > 0 && totalScopeItems > 1;
      const coverageRatio =
        totalScopeItems > 0
          ? (totalScopeItems - missing.length) / totalScopeItems
          : 1;
      const scopePenalty = hasMissing ? Math.round((1 - coverageRatio) * 35) : 0;

      // Check for missing items scope risk
      if (hasMissing) {
        riskAnalysis.push({
          level: "high",
          title: "Incomplete Line-Item Scope",
          description: `${supplierName} omitted ${missing.length} item(s) (${missing.join(", ")}). Their quote does not satisfy the complete project scope and requires secondary procurement.`,
          affectedSupplier: supplierName,
        });
      }

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
      if (!isWinner && projectedSavings > 0) {
        negotiationPoints.push({
          supplierName,
          quoteNumber: q.quoteNumber,
          leveragePoint: `Price is higher than lowest qualified benchmark by ${formatCurrency(totalAmount - Number(recommendedWinner.totalAmount || 0))}`,
          recommendedAction: `Ask ${supplierName} for a competitive volume discount to match the lead bid.`,
          potentialImpact: `Potential price reduction of up to ${formatCurrency(totalAmount - Number(recommendedWinner.totalAmount || 0))}.`,
          draftEmailSnippet: `We have reviewed quotation ${q.quoteNumber}. While we appreciate your proposal, your quote is currently above alternative qualified vendors. Could you offer an improved volume rate?`,
        });
      }

      // Scorecard calculation with scope completeness penalty
      const rawPriceScore = Math.max(
        40,
        Math.round(
          100 -
            ((totalAmount - Number(recommendedWinner.totalAmount || 0)) /
              Number(highest.totalAmount || 1)) *
              40
        )
      );
      const priceScore = hasMissing
        ? Math.round(rawPriceScore * Math.min(1, coverageRatio + 0.15))
        : rawPriceScore;
      const deliveryScore = 85;
      const termsScore = terms.includes("net 30") || terms.includes("net 45") ? 90 : 70;
      const riskScore = Math.max(
        20,
        (terms.includes("immediate") ? 65 : 85) - (hasMissing ? 25 : 0)
      );
      const rawOverall = Math.round(
        priceScore * 0.45 + deliveryScore * 0.25 + termsScore * 0.15 + riskScore * 0.15
      );
      const overallScore = Math.max(15, Math.min(100, rawOverall - scopePenalty));

      const strengths: string[] = [];
      if (!hasMissing && totalScopeItems > 1) {
        strengths.push(`Complete item scope (${totalScopeItems}/${totalScopeItems} items quoted)`);
      }
      if (isWinner) {
        strengths.push("Lowest total cost bid for complete scope", "Optimal price-to-terms balance");
      } else if (isAbsoluteLowest) {
        strengths.push("Lowest unit prices on quoted items");
      } else {
        strengths.push("Established supplier profile");
      }

      const weaknesses: string[] = [];
      if (hasMissing) {
        weaknesses.push(
          `Missing ${missing.length} item(s): ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""}`
        );
      }
      if (!isWinner && !isAbsoluteLowest) {
        weaknesses.push("Priced above market benchmark");
      }

      supplierScores.push({
        supplierName,
        quoteNumber: q.quoteNumber,
        overallScore,
        priceScore,
        deliveryScore,
        termsScore,
        riskScore,
        strengths,
        weaknesses,
        missingItems: missing,
        missingItemsCount: missing.length,
        totalScopeItemsCount: totalScopeItems,
        itemCoveragePercent: Math.round(coverageRatio * 100),
        scopePenalized: hasMissing,
      });
    });

    const recommendationReason =
      completeQuotes.length > 0 && absoluteLowest.id !== recommendedWinner.id
        ? `${recommendedWinner.supplier?.name || "Recommended vendor"} provides 100% complete line-item scope at the lowest cost of ${formatCurrency(Number(recommendedWinner.totalAmount || 0))}. (Note: ${absoluteLowest.supplier?.name || "Alternative vendor"} had a lower subtotal but omitted items from scope).`
        : `Delivers the lowest overall procurement expenditure of ${formatCurrency(Number(recommendedWinner.totalAmount || 0))} with standard commercial compliance.`;

    return {
      summary: `Analyzed ${quotes.length} quotations across ${totalScopeItems} required scope items. ${recommendedWinner.supplier?.name || "The leading vendor"} presents the most cost-effective complete solution with total projected savings of ${formatCurrency(projectedSavings)}.`,
      recommendedSupplierName: recommendedWinner.supplier?.name || "Supplier",
      recommendationReason,
      projectedSavings,
      strategicActionPlan: [
        `Confirm order allocation with ${recommendedWinner.supplier?.name || "recommended vendor"} before validity expiration`,
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
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);
}

interface CrossQuoteScope {
  masterItemMap: Map<string, string>;
  totalScopeItems: number;
  quoteMissingMap: Map<string, string[]>;
}

function extractCrossQuoteItemScope(quotes: SupplierQuoteEntity[]): CrossQuoteScope {
  const masterItemMap = new Map<string, string>(); // normalizedKey -> best description
  quotes.forEach((q) => {
    (q.quoteLines || []).forEach((line) => {
      const desc = line.description?.trim() || "";
      const part = line.partNumber?.trim() || "";
      const normalizedKey = (part || desc).toLowerCase();
      if (normalizedKey && !masterItemMap.has(normalizedKey)) {
        masterItemMap.set(normalizedKey, desc || part || "Line Item");
      }
    });
  });

  const totalScopeItems = masterItemMap.size;
  const quoteMissingMap = new Map<string, string[]>();

  quotes.forEach((q) => {
    const presentKeys = new Set(
      (q.quoteLines || []).map((l) =>
        (l.partNumber?.trim() || l.description?.trim() || "").toLowerCase()
      )
    );
    const missing: string[] = [];
    if (totalScopeItems > 0 && quotes.length > 1) {
      masterItemMap.forEach((title, key) => {
        if (!presentKeys.has(key)) {
          missing.push(title);
        }
      });
    }
    quoteMissingMap.set(q.id, missing);
    if (q.quoteNumber) {
      quoteMissingMap.set(q.quoteNumber.toLowerCase(), missing);
    }
    if (q.supplier?.name) {
      quoteMissingMap.set(q.supplier.name.toLowerCase(), missing);
    }
  });

  return { masterItemMap, totalScopeItems, quoteMissingMap };
}
