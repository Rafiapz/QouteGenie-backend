import { ComparisonRepository } from "../../../infrastructure/repositories/comparison.repository";
import { QuoteRepository } from "../../../infrastructure/repositories/quote.repository";
import { QuoteAiAnalyzerService } from "../../../infrastructure/services/quote-ai-analyzer.service";
import { QuoteComparisonEntity } from "../../../domain/entities/comparison.entity";
import { IntelligentAnalysisResult } from "../../../domain/entities/quote-analysis.entity";
import { CreateComparisonDto, UpdateComparisonDto } from "../../dtos/comparison.dto";
import { NotFoundError, ValidationError, PlanLimitError } from "../../../domain/errors/domain.error";
import { redisClient } from "../../../infrastructure/cache/redis.client";

export class ComparisonUseCase {
  constructor(
    private readonly comparisonRepository: ComparisonRepository,
    private readonly quoteRepository: QuoteRepository,
    private readonly quoteAiAnalyzerService: QuoteAiAnalyzerService
  ) {}

  async createComparison(
    organizationId: string,
    dto: CreateComparisonDto,
    userPlan: number = 1
  ): Promise<QuoteComparisonEntity> {
    if (!dto.quoteIds || dto.quoteIds.length === 0) {
      throw new ValidationError("At least one quote ID must be specified for comparison.");
    }

    // Free plan limits:
    // 1. Can compare up to 3 quotations in each comparison
    // 2. Can create a maximum of 3 comparisons
    const isFreePlan = (userPlan ?? 1) === 1;
    if (isFreePlan) {
      if (dto.quoteIds.length > 3) {
        throw new PlanLimitError(
          "Free plan limit exceeded: You can only compare up to 3 quotations at a time on the Free plan. Please upgrade to compare more quotations."
        );
      }

      const existingComparisons = await this.comparisonRepository.findAllByOrganization(organizationId);
      if (existingComparisons.length >= 3) {
        throw new PlanLimitError(
          "Free plan limit reached: You can create a maximum of 3 comparisons on the Free plan. Please upgrade to unlock unlimited comparisons."
        );
      }
    }

    const name = dto.name?.trim() || `Comparison (${new Date().toLocaleDateString()})`;

    return this.comparisonRepository.create({
      organizationId,
      name,
      description: dto.description?.trim() || null,
      quoteIds: dto.quoteIds,
    });
  }

  async getComparisons(organizationId: string): Promise<QuoteComparisonEntity[]> {
    return this.comparisonRepository.findAllByOrganization(organizationId);
  }

  async getComparisonById(id: string, organizationId: string): Promise<QuoteComparisonEntity> {
    const comparison = await this.comparisonRepository.findById(id, organizationId);
    if (!comparison) {
      throw new NotFoundError("QuoteComparison", id);
    }
    return comparison;
  }

  async updateComparison(
    id: string,
    organizationId: string,
    dto: UpdateComparisonDto,
    userPlan: number = 1
  ): Promise<QuoteComparisonEntity> {
    const isFreePlan = (userPlan ?? 1) === 1;
    if (isFreePlan && dto.quoteIds && dto.quoteIds.length > 3) {
      throw new PlanLimitError(
        "Free plan limit exceeded: You can only compare up to 3 quotations at a time on the Free plan. Please upgrade your plan to compare more quotations."
      );
    }

    const updated = await this.comparisonRepository.update(id, organizationId, {
      name: dto.name?.trim(),
      description: dto.description?.trim(),
      quoteIds: dto.quoteIds,
    });

    if (!updated) {
      throw new NotFoundError("QuoteComparison", id);
    }

    // Invalidate AI analysis cache when quotations set is updated
    if (dto.quoteIds && dto.quoteIds.length > 0) {
      try {
        await redisClient.delByPattern(`quote_analysis:${organizationId}:*`);
        await redisClient.del(`comparison_analysis:${organizationId}:${id}`);
        await redisClient.del(`comparison:${organizationId}:${id}`);
        await redisClient.delByPattern(`*${id}*`);
      } catch (cacheErr) {
        console.warn(`Failed to clear cache on comparison update ${id}:`, cacheErr);
      }
    }

    return updated;
  }

  async deleteComparison(id: string, organizationId: string): Promise<void> {
    const comparison = await this.comparisonRepository.findById(id, organizationId);
    if (!comparison) {
      throw new NotFoundError("QuoteComparison", id);
    }

    // 1. Invalidate AI analysis from Redis cache for this comparison's quotation set
    if (comparison.quoteIds && comparison.quoteIds.length > 0) {
      try {
        const allQuotes = await this.quoteRepository.findByOrganizationId(organizationId);
        const comparisonQuotes = allQuotes.filter((q) => comparison.quoteIds.includes(q.id));
        if (comparisonQuotes.length > 0) {
          await this.quoteAiAnalyzerService.invalidateQuotesAnalysis(comparisonQuotes, organizationId);
        }
      } catch (cacheErr) {
        console.warn(`Failed to invalidate AI analysis cache for comparison ${id}:`, cacheErr);
      }
    }

    // 2. Invalidate any direct comparison cache keys in Redis
    try {
      await redisClient.del(`comparison:${organizationId}:${id}`);
      await redisClient.del(`comparison_analysis:${organizationId}:${id}`);
      await redisClient.del(`comparison:${id}`);
      await redisClient.delByPattern(`*${id}*`);
    } catch (redisErr) {
      console.warn(`Failed to clear Redis keys for comparison ${id}:`, redisErr);
    }

    // 3. Delete comparison from database repository
    const success = await this.comparisonRepository.delete(id, organizationId);
    if (!success) {
      throw new NotFoundError("QuoteComparison", id);
    }
  }

  async analyzeComparison(
    id: string,
    organizationId: string,
    forceRefresh: boolean = false,
    clientQuoteIds?: string[],
    userPlan: number = 1
  ): Promise<IntelligentAnalysisResult> {
    const comparison = await this.getComparisonById(id, organizationId);
    const targetQuoteIds = (clientQuoteIds && clientQuoteIds.length > 0)
      ? clientQuoteIds
      : comparison.quoteIds;

    if (!targetQuoteIds || targetQuoteIds.length === 0) {
      throw new ValidationError("This comparison does not contain any quotations.");
    }

    const isFreePlan = (userPlan ?? 1) === 1;
    if (isFreePlan && targetQuoteIds.length > 3) {
      throw new PlanLimitError(
        "Free plan limit exceeded: You can only compare up to 3 quotations at a time on the Free plan. Please upgrade your plan to compare more quotations."
      );
    }

    const allQuotes = await this.quoteRepository.findByOrganizationId(organizationId);
    let comparisonQuotes = allQuotes.filter((q) => targetQuoteIds.includes(q.id));

    if (comparisonQuotes.length < targetQuoteIds.length) {
      const byIds = await this.quoteRepository.findByIds(targetQuoteIds);
      if (byIds.length > comparisonQuotes.length) {
        comparisonQuotes = byIds;
      }
    }

    if (comparisonQuotes.length === 0) {
      throw new NotFoundError("SupplierQuote", "No matching quotations found for this comparison.");
    }

    return this.quoteAiAnalyzerService.analyzeQuotations(
      comparisonQuotes,
      organizationId,
      forceRefresh
    );
  }
}
