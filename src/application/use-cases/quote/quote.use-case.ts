import { PdfExtractorService } from "../../../infrastructure/services/pdf-extractor.service";
import { QuoteAiAnalyzerService } from "../../../infrastructure/services/quote-ai-analyzer.service";
import { QuoteRepository } from "../../../infrastructure/repositories/quote.repository";
import { SupplierRepository } from "../../../infrastructure/repositories/supplier.repository";
import {
  ExtractedQuoteData,
  SupplierQuoteEntity,
  QuoteFilterOptions,
} from "../../../domain/entities/quote.entity";
import { IntelligentAnalysisResult } from "../../../domain/entities/quote-analysis.entity";
import { SaveQuoteDto } from "../../dtos/quote.dto";
import { ConflictError, NotFoundError, PlanLimitError } from "../../../domain/errors/domain.error";

export class QuoteUseCase {
  constructor(
    private readonly pdfExtractorService: PdfExtractorService,
    private readonly quoteRepository: QuoteRepository,
    private readonly supplierRepository: SupplierRepository,
    private readonly quoteAiAnalyzerService: QuoteAiAnalyzerService
  ) {}

  async extractQuote(
    filePath: string,
    originalFileName: string,
    mimeType: string,
    fileSize: number,
    organizationId: string,
    userPlan?: number
  ): Promise<ExtractedQuoteData> {
    // Check Free Plan limit: max 4 quotations
    const plan = userPlan ?? 1;
    if (plan === 1) {
      const quoteCount = await this.quoteRepository.countQuotes(organizationId);
      if (quoteCount >= 4) {
        throw new PlanLimitError(
          "Free Plan Limit Reached: You can upload a maximum of 4 quotations on the Free plan. Please upgrade your plan or remove an existing quotation to upload more."
        );
      }
    }

    // 1. Extract raw data and tables from PDF
    const extracted = await this.pdfExtractorService.extractFromPdf(filePath, originalFileName);

    // 2. Persist uploaded file record in uploaded_files table
    const fileRecord = await this.quoteRepository.saveUploadedFile({
      organizationId,
      originalFileName,
      mimeType,
      filePath,
      fileSize,
    });

    extracted.fileId = fileRecord.id;

    // 3. Match with existing suppliers in organization if possible
    if (extracted.supplier?.name) {
      const existingSupplier = await this.supplierRepository.findByName(
        extracted.supplier.name,
        organizationId
      );
      if (existingSupplier) {
        extracted.supplier.name = existingSupplier.name;
        if (existingSupplier.email) extracted.supplier.email = existingSupplier.email;
        if (existingSupplier.phone) extracted.supplier.phone = existingSupplier.phone;
        if (existingSupplier.address) extracted.supplier.address = existingSupplier.address;
      }
    }

    return extracted;
  }

  async saveQuote(
    data: SaveQuoteDto,
    organizationId: string,
    userPlan?: number
  ): Promise<SupplierQuoteEntity> {
    // Check Free Plan limit: max 4 quotations
    const plan = userPlan ?? 1;
    if (plan === 1) {
      const quoteCount = await this.quoteRepository.countQuotes(organizationId);
      if (quoteCount >= 4) {
        throw new PlanLimitError(
          "Free Plan Limit Reached: You can store a maximum of 4 quotations on the Free plan. Please upgrade your plan or remove an existing quotation to upload more."
        );
      }
    }

    // 1. Check if quotation with same quoteNumber already exists in organization
    const existingQuote = await this.quoteRepository.findByQuoteNumber(
      data.quoteNumber,
      organizationId
    );
    if (existingQuote) {
      throw new ConflictError(
        `Quotation "${data.quoteNumber}" is already registered in your organization.`
      );
    }

    // 2. Find or create supplier
    let supplierId = data.supplierId;
    if (!supplierId) {
      let supplier = await this.supplierRepository.findByName(
        data.supplierName,
        organizationId
      );
      if (!supplier) {
        supplier = await this.supplierRepository.create({
          name: data.supplierName,
          organizationId,
        });
      }
      supplierId = supplier.id;
    }

    // 3. Save quote and lines
    const savedQuote = await this.quoteRepository.createQuote({
      organizationId,
      supplierId,
      quoteNumber: data.quoteNumber,
      quoteDate: new Date(data.quoteDate),
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      status: 1, // 1: Verified
      currency: data.currency || "INR",
      deliveryLeadTime: data.deliveryLeadTime || null,
      paymentTerms: data.paymentTerms || null,
      totalAmount: data.totalAmount ?? null,
      taxAmount: data.taxAmount ?? null,
      notes: data.notes || null,
      lines: data.lines.map((line) => ({
        partNumber: line.partNumber,
        description: line.description || null,
        quantity: line.quantity,
        unit: line.unit || "units",
        price: line.price,
        totalPrice: line.totalPrice ?? line.quantity * line.price,
      })),
    });

    return savedQuote;
  }

  async getQuotes(
    organizationId: string,
    filters?: QuoteFilterOptions
  ): Promise<SupplierQuoteEntity[]> {
    return this.quoteRepository.findByOrganizationId(organizationId, filters);
  }

  async getQuoteById(id: string, organizationId: string): Promise<SupplierQuoteEntity> {
    const quote = await this.quoteRepository.findById(id, organizationId);
    if (!quote) {
      throw new NotFoundError("SupplierQuote", id);
    }
    return quote;
  }

  async deleteQuote(id: string, organizationId: string): Promise<void> {
    const deleted = await this.quoteRepository.deleteQuote(id, organizationId);
    if (!deleted) {
      throw new NotFoundError("SupplierQuote", id);
    }
  }

  async analyzeQuotes(
    quoteIds: string[] | undefined,
    organizationId: string,
    forceRefresh: boolean = false
  ): Promise<IntelligentAnalysisResult> {
    let quotes: SupplierQuoteEntity[];
    if (quoteIds && quoteIds.length > 0) {
      const all = await this.quoteRepository.findByOrganizationId(organizationId);
      quotes = all.filter((q) => quoteIds.includes(q.id));
    } else {
      quotes = await this.quoteRepository.findByOrganizationId(organizationId);
    }

    if (quotes.length === 0) {
      throw new NotFoundError("SupplierQuote", "No quotations found for analysis.");
    }

    return this.quoteAiAnalyzerService.analyzeQuotations(quotes, organizationId, forceRefresh);
  }
}
