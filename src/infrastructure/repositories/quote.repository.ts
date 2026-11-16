import fs from "fs";
import { prisma } from "../database/prisma.client";
import {
  SupplierQuoteEntity,
  QuoteLineEntity,
  UploadedFileEntity,
} from "../../domain/entities/quote.entity";

// Safe accessor that types delegates even if TS server cached stale definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as typeof prisma & {
  supplierQuote: any;
  quoteLine: any;
  uploadedFile: any;
  supplier: any;
};

export interface CreateUploadedFileInput {
  organizationId: string;
  originalFileName: string;
  mimeType: string;
  filePath?: string | null;
  fileSize?: number | null;
  quoteId?: string | null;
}

export interface CreateQuoteLineInput {
  partNumber: string;
  description?: string | null;
  quantity: number;
  unit?: string | null;
  price: number;
  totalPrice?: number | null;
}

export interface CreateQuoteInput {
  organizationId: string;
  supplierId: string;
  quoteNumber: string;
  quoteDate: Date;
  validUntil?: Date | null;
  status?: number;
  currency?: string;
  deliveryLeadTime?: string | null;
  paymentTerms?: string | null;
  totalAmount?: number | null;
  taxAmount?: number | null;
  notes?: string | null;
  lines: CreateQuoteLineInput[];
}

export class QuoteRepository {
  async saveUploadedFile(data: CreateUploadedFileInput): Promise<UploadedFileEntity> {
    const file = await db.uploadedFile.create({
      data: {
        organizationId: data.organizationId,
        originalFileName: data.originalFileName,
        mimeType: data.mimeType,
        filePath: data.filePath ?? null,
        fileSize: data.fileSize ?? null,
        quoteId: data.quoteId ?? null,
      },
    });

    return {
      id: file.id,
      organizationId: file.organizationId,
      quoteId: file.quoteId,
      originalFileName: file.originalFileName,
      mimeType: file.mimeType,
      filePath: file.filePath,
      fileSize: file.fileSize,
      createdAt: file.createdAt,
    };
  }

  async createQuote(data: CreateQuoteInput): Promise<SupplierQuoteEntity> {
    const quote = await db.supplierQuote.create({
      data: {
        organizationId: data.organizationId,
        supplierId: data.supplierId,
        quoteNumber: data.quoteNumber,
        quoteDate: data.quoteDate,
        validUntil: data.validUntil ?? null,
        status: data.status ?? 0,
        currency: data.currency ?? "INR",
        deliveryLeadTime: data.deliveryLeadTime ?? null,
        paymentTerms: data.paymentTerms ?? null,
        totalAmount: data.totalAmount ?? null,
        taxAmount: data.taxAmount ?? null,
        notes: data.notes ?? null,
        quoteLines: {
          create: data.lines.map((line) => ({
            partNumber: line.partNumber,
            description: line.description ?? null,
            quantity: line.quantity,
            unit: line.unit ?? "units",
            price: line.price,
            totalPrice: line.totalPrice ?? line.quantity * line.price,
          })),
        },
      },
      include: {
        supplier: true,
        quoteLines: true,
      },
    });

    return this.mapQuoteEntity(quote);
  }

  async findByOrganizationId(organizationId: string): Promise<SupplierQuoteEntity[]> {
    const quotes = await db.supplierQuote.findMany({
      where: { organizationId },
      include: {
        supplier: true,
        quoteLines: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return quotes.map((q: any) => this.mapQuoteEntity(q));
  }

  async findById(id: string, organizationId: string): Promise<SupplierQuoteEntity | null> {
    const quote = await db.supplierQuote.findFirst({
      where: { id, organizationId },
      include: {
        supplier: true,
        quoteLines: true,
      },
    });

    if (!quote) return null;
    return this.mapQuoteEntity(quote);
  }

  async findByQuoteNumber(quoteNumber: string, organizationId: string): Promise<SupplierQuoteEntity | null> {
    const quote = await db.supplierQuote.findFirst({
      where: { quoteNumber, organizationId },
      include: {
        supplier: true,
        quoteLines: true,
      },
    });

    if (!quote) return null;
    return this.mapQuoteEntity(quote);
  }

  async deleteQuote(id: string, organizationId: string): Promise<boolean> {
    // 1. Clean up associated uploaded files on disk and in database
    try {
      const files = await db.uploadedFile.findMany({
        where: { quoteId: id, organizationId },
      });

      for (const file of files) {
        if (file.filePath && fs.existsSync(file.filePath)) {
          try {
            fs.unlinkSync(file.filePath);
          } catch (err) {
            console.error(`Failed to delete disk file: ${file.filePath}`, err);
          }
        }
      }

      await db.uploadedFile.deleteMany({
        where: { quoteId: id, organizationId },
      });
    } catch (err) {
      console.warn("Non-critical cleanup warning during quotation deletion:", err);
    }

    // 2. Delete supplier quote (quote lines cascade delete via PostgreSQL foreign key constraint)
    const result = await db.supplierQuote.deleteMany({
      where: { id, organizationId },
    });

    return result.count > 0;
  }

  private mapQuoteEntity(quote: any): SupplierQuoteEntity {
    return {
      id: quote.id,
      organizationId: quote.organizationId,
      supplierId: quote.supplierId,
      quoteNumber: quote.quoteNumber,
      quoteDate: quote.quoteDate,
      validUntil: quote.validUntil,
      status: quote.status,
      currency: quote.currency,
      deliveryLeadTime: quote.deliveryLeadTime,
      paymentTerms: quote.paymentTerms,
      totalAmount: quote.totalAmount ? Number(quote.totalAmount) : null,
      taxAmount: quote.taxAmount ? Number(quote.taxAmount) : null,
      notes: quote.notes,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
      supplier: quote.supplier
        ? {
            id: quote.supplier.id,
            name: quote.supplier.name,
            email: quote.supplier.email,
            phone: quote.supplier.phone,
            address: quote.supplier.address,
          }
        : undefined,
      quoteLines: quote.quoteLines
        ? quote.quoteLines.map((line: any) => ({
            id: line.id,
            quoteId: line.quoteId,
            partNumber: line.partNumber,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            price: Number(line.price),
            totalPrice: line.totalPrice ? Number(line.totalPrice) : null,
            createdAt: line.createdAt,
          }))
        : [],
    };
  }
}
