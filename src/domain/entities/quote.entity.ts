export interface ExtractedLineItem {
  partNumber: string;
  description: string;
  quantity: number;
  unit: string;
  price: number;
  totalPrice: number;
}

export interface ExtractedSupplierInfo {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface ExtractedQuoteData {
  fileId?: string;
  fileName: string;
  fileSize: number;
  quoteNumber: string;
  quoteDate: string; // ISO date YYYY-MM-DD
  validUntil: string | null; // ISO date YYYY-MM-DD
  status: number; // 0: Draft/Extracted, 1: Verified
  currency: string;
  deliveryLeadTime: string | null;
  paymentTerms: string | null;
  supplier: ExtractedSupplierInfo;
  items: ExtractedLineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  confidenceScore: number;
  rawTextPreview?: string;
}

export interface SupplierQuoteEntity {
  id: string;
  organizationId: string;
  supplierId: string;
  quoteNumber: string;
  quoteDate: Date;
  validUntil: Date | null;
  status: number;
  currency: string;
  deliveryLeadTime: string | null;
  paymentTerms: string | null;
  totalAmount: number | null;
  taxAmount: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  supplier?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  quoteLines?: QuoteLineEntity[];
}

export interface QuoteLineEntity {
  id: string;
  quoteId: string;
  partNumber: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  price: number;
  totalPrice: number | null;
  createdAt: Date;
}

export interface UploadedFileEntity {
  id: string;
  organizationId: string;
  quoteId: string | null;
  originalFileName: string;
  mimeType: string;
  filePath: string | null;
  fileSize: number | null;
  createdAt: Date;
}
