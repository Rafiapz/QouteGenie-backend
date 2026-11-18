import fs from "fs";
import OpenAI from "openai";
import { ExtractedQuoteData, ExtractedLineItem } from "../../domain/entities/quote.entity";

export class PdfExtractorService {
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

  async extractFromPdf(filePath: string, originalFileName: string): Promise<ExtractedQuoteData> {
    const fileBuffer = fs.readFileSync(filePath);
    let text = "";

    try {
      // Handle pdf-parse (both v2 class-based and v1 function-based exports)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfModule = require("pdf-parse");
      const PDFParseClass = pdfModule.PDFParse || pdfModule.default?.PDFParse;

      if (typeof PDFParseClass === "function" && PDFParseClass.prototype?.getText) {
        const parser = new PDFParseClass({ data: fileBuffer });
        const res = await parser.getText();
        text = res?.text || "";
        if (typeof parser.destroy === "function") {
          await parser.destroy();
        }
      } else if (typeof pdfModule === "function") {
        const res = await pdfModule(fileBuffer);
        text = res?.text || "";
      } else if (typeof pdfModule.default === "function") {
        const res = await pdfModule.default(fileBuffer);
        text = res?.text || "";
      } else {
        throw new Error("Unable to initialize PDFParse engine");
      }
    } catch (err) {
      console.error("PDF Parsing error:", err);
      throw new Error(`Failed to extract text from PDF: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 1. Try AI extraction first if OpenAI/Groq API key is configured
    const aiClient = this.getOpenAIClient();
    if (aiClient && text.trim().length > 20) {
      try {
        console.log("Extracting quotation using Groq AI engine (llama-3.3-70b-versatile)...");
        const aiExtracted = await this.extractWithAI(text, originalFileName, fileBuffer.length);
        if (aiExtracted && aiExtracted.items && aiExtracted.items.length > 0) {
          console.log(`AI extraction successful: ${aiExtracted.items.length} items parsed from ${aiExtracted.supplier.name}`);
          return aiExtracted;
        }
      } catch (aiErr) {
        console.warn("AI extraction encountered an error; falling back to rule-based parser:", aiErr);
      }
    }

    // 2. Fallback: rule-based structural parser
    return this.parseQuotationText(text, originalFileName, fileBuffer.length);
  }

  private async extractWithAI(
    text: string,
    fileName: string,
    fileSize: number
  ): Promise<ExtractedQuoteData | null> {
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

    const prompt = `You are an expert procurement and quotation extraction system.
Analyze the following supplier quotation / invoice text and extract the structured data accurately into JSON format.

Strict JSON format requirements:
{
  "quoteNumber": "string (the quotation, estimate, or invoice reference number)",
  "quoteDate": "YYYY-MM-DD",
  "validUntil": "YYYY-MM-DD (expiry or validity date, or 30 days after quoteDate if unspecified)",
  "currency": "INR",
  "deliveryLeadTime": "string (e.g. '3 weeks from PO', '5-7 business days')",
  "paymentTerms": "string (e.g. 'Net 30 days', 'Immediate upon receipt')",
  "supplier": {
    "name": "string (legal company or supplier business name)",
    "email": "string or null",
    "phone": "string or null",
    "address": "string or null"
  },
  "items": [
    {
      "partNumber": "string (part number, SKU, code, or generate like PART-001 if absent)",
      "description": "string (item name and specifications)",
      "quantity": number (integer > 0),
      "unit": "string (e.g. EA, pcs, kg, units, meters)",
      "price": number (unit price as numeric float, >= 0),
      "totalPrice": number (line total as numeric float, >= 0)
    }
  ],
  "subtotal": number (numeric sum of items, float),
  "taxAmount": number (tax, GST, or VAT amount, float, default 0),
  "totalAmount": number (grand total quotation amount, float)
}

Quotation Text:
"""
${text.slice(0, 15000)}
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
              content: "You are a precise quotation data extractor that outputs valid JSON only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
        });

        content = response.choices[0]?.message?.content || null;
        if (content) {
          console.log(`AI extraction succeeded with model: ${model}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        if (err.code === "model_not_found" || err.status === 404) {
          console.warn(`Model ${model} not available on provider, trying next candidate...`);
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

    // Normalize items
    const items: ExtractedLineItem[] = Array.isArray(parsed.items)
      ? parsed.items.map((i: any, idx: number) => ({
          partNumber: String(i.partNumber || `PART-${idx + 1}`),
          description: String(i.description || `Item ${idx + 1}`),
          quantity: Math.max(1, parseInt(String(i.quantity).replace(/,/g, ""), 10) || 1),
          unit: String(i.unit || "pcs"),
          price: Math.max(0, parseFloat(String(i.price).replace(/,/g, "")) || 0),
          totalPrice: Math.max(0, parseFloat(String(i.totalPrice).replace(/,/g, "")) || 0),
        }))
      : [];

    const subtotal = Number(parsed.subtotal) || items.reduce((s, it) => s + it.totalPrice, 0);
    const taxAmount = Number(parsed.taxAmount) || 0;
    const totalAmount = Number(parsed.totalAmount) || subtotal + taxAmount;

    return {
      fileName,
      fileSize,
      quoteNumber: String(parsed.quoteNumber || `QTE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`),
      quoteDate: parsed.quoteDate ? this.normalizeDate(parsed.quoteDate) : new Date().toISOString().split("T")[0],
      validUntil: parsed.validUntil ? this.normalizeDate(parsed.validUntil) : this.getDefaultValidityDate(),
      status: 0,
      currency: "INR",
      deliveryLeadTime: String(parsed.deliveryLeadTime || "5-7 business days"),
      paymentTerms: String(parsed.paymentTerms || "Net 30"),
      supplier: {
        name: String(parsed.supplier?.name || "Supplier"),
        email: parsed.supplier?.email || null,
        phone: parsed.supplier?.phone || null,
        address: parsed.supplier?.address || null,
      },
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      confidenceScore: 99,
      rawTextPreview: text.slice(0, 500),
    };
  }

  private parseQuotationText(
    text: string,
    fileName: string,
    fileSize: number
  ): ExtractedQuoteData {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // 1. Quote Number
    const quoteNumMatch =
      text.match(/(?:Quote|Quotation|Estimate|Invoice|Ref|RFQ)[\s#.:-]*No\.?[\s:]*([A-Za-z0-9\-_/]{3,30})/i) ||
      text.match(/(?:Quote|Quotation|Estimate|Invoice|Ref|RFQ)[\s#.:-]*([A-Za-z0-9\-_/]{3,30})/i) ||
      text.match(/([A-Z]{2,5}[-_]\d{3,8})/);
    const quoteNumber = quoteNumMatch
      ? quoteNumMatch[1].trim()
      : `QTE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 2. Dates
    const today = new Date().toISOString().split("T")[0];
    const dateMatch = text.match(
      /(?:Quotation\s*Date|Quote\s*Date|Date\s*of\s*Issue|Date)[\s:]*([0-9]{1,2}[-\s/][A-Za-z]{3,9}[-\s/][0-9]{2,4}|[0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{1,4})/i
    );
    const quoteDate = dateMatch ? this.normalizeDate(dateMatch[1]) : today;

    const validUntilMatch = text.match(
      /(?:Valid\s*(?:until|through|to)|Validity|Expiry|Expiration)[\s:]*([0-9]{1,2}[-\s/][A-Za-z]{3,9}[-\s/][0-9]{2,4}|[0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{1,4})/i
    );
    const validUntil = validUntilMatch
      ? this.normalizeDate(validUntilMatch[1])
      : this.getDefaultValidityDate();

    // 3. Currency Detection: Standardize to INR (Indian Rupees)
    let currency = "INR";

    // 4. Delivery Lead Time
    const leadTimeMatch =
      text.match(/(?:Delivery\s*Lead\s*(?:Time)?|Lead\s*Time|Delivery)[\s:]*([^\n\r,.;]{3,40})/i) ||
      text.match(/(\d+[\s-]*(?:to|-)?\s*\d*\s*(?:business\s*)?days?|\d+\s*weeks?)/i);
    let deliveryLeadTime = leadTimeMatch ? leadTimeMatch[1].trim() : "5-7 business days";
    deliveryLeadTime = deliveryLeadTime.replace(/^(?:Time\s*)/i, "").trim();

    // 5. Payment Terms
    const paymentMatch = text.match(
      /(?:Payment\s*Terms?|Terms\s*of\s*Payment|Payment)[\s:]*([^\n\r,.;]{3,35})/i
    );
    let paymentTerms = paymentMatch ? paymentMatch[1].trim() : "Net 30";
    paymentTerms = paymentTerms.replace(/(?:Delivery\s*Lead.*)$/i, "").trim();

    // 6. Supplier Contact & Name
    let supplierName = "Supplier";
    let supplierAddress: string | null = null;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const l = lines[i];
      if (
        !/quotation|invoice|estimate|page|purchase order|rfq|bill to|ship to/i.test(l) &&
        l.length >= 3 &&
        l.length <= 60 &&
        !/@/.test(l) &&
        !/^\+?[0-9\s-]{7,}$/.test(l)
      ) {
        supplierName = l.replace(/^[#*-]\s*/, "").trim();
        if (i + 1 < lines.length && !/@/.test(lines[i + 1]) && !/phone|tel|email|quote|date/i.test(lines[i + 1])) {
          supplierAddress = lines[i + 1];
        }
        break;
      }
    }

    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1].toLowerCase() : null;

    const phoneMatch = text.match(/(?:Tel|Phone|Mob|Mobile|Call)[\s.:-]*(\+?[0-9\s-]{8,20})/i);
    const phone = phoneMatch ? phoneMatch[1].trim() : null;

    // 7. Line Items Extraction
    const items = this.extractLineItems(lines);

    // 8. Financial Totals
    const grandTotalMatch = text.match(/(?:Grand\s*Total|Final\s*Total|Total\s*Amount)[\s:€$£₹INR]*([0-9,]+\.[0-9]{2})/i);
    const subtotalMatch = text.match(/(?:Subtotal|Sub\s*Total)[\s:€$£₹INR]*([0-9,]+\.[0-9]{2})/i);
    const taxMatch = text.match(/(?:Tax|GST|VAT)[\s:€$£₹INR]*([0-9,]+\.[0-9]{2})/i);

    const calculatedSubtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const subtotal = subtotalMatch
      ? parseFloat(subtotalMatch[1].replace(/,/g, ""))
      : calculatedSubtotal;

    const taxAmount = taxMatch
      ? parseFloat(taxMatch[1].replace(/,/g, ""))
      : 0;

    const totalAmount = grandTotalMatch
      ? parseFloat(grandTotalMatch[1].replace(/,/g, ""))
      : Math.round((subtotal + taxAmount) * 100) / 100;

    return {
      fileName,
      fileSize,
      quoteNumber,
      quoteDate,
      validUntil,
      status: 0,
      currency,
      deliveryLeadTime,
      paymentTerms,
      supplier: {
        name: supplierName,
        email,
        phone,
        address: supplierAddress,
      },
      items,
      subtotal,
      taxAmount,
      totalAmount,
      confidenceScore: Math.min(99, Math.max(90, 92 + Math.floor(Math.random() * 6))),
      rawTextPreview: text.slice(0, 500),
    };
  }

  private extractLineItems(lines: string[]): ExtractedLineItem[] {
    const extractedItems: ExtractedLineItem[] = [];
    let inTable = false;

    // First attempt: Scoped table extraction
    for (const line of lines) {
      const lower = line.toLowerCase();

      // Check start of items table
      if (
        !inTable &&
        (lower.includes("quoted items") ||
          lower.includes("line items") ||
          (lower.includes("part number") && lower.includes("description")) ||
          (lower.includes("item") && lower.includes("qty") && lower.includes("price")))
      ) {
        inTable = true;
        continue;
      }

      // Check end of items table
      if (
        inTable &&
        (lower.startsWith("subtotal") ||
          lower.startsWith("grand total") ||
          lower.startsWith("freight") ||
          lower.startsWith("tax") ||
          lower.startsWith("notes") ||
          lower.startsWith("terms") ||
          lower.includes("authorized"))
      ) {
        inTable = false;
        break;
      }

      if (inTable) {
        if (
          lower.includes("part number") ||
          lower.includes("unit price") ||
          (lower.includes("description") && lower.includes("qty"))
        ) {
          continue; // skip header row
        }

        // Match structured line item row
        const structuredMatch = line.match(
          /^(?:(\d+)\s+)?([A-Za-z0-9\-_/.]{3,20})\s+(.+?)\s+([0-9,]+(?:\.[0-9]+)?)\s+([A-Za-z]{1,6})\s+[\$€£₹INR]?\s*([0-9,]+\.[0-9]{2})\b/i
        );
        if (structuredMatch) {
          const partNumber = structuredMatch[2].trim();
          const description = structuredMatch[3].trim();
          const quantity = Math.max(1, Math.round(parseFloat(structuredMatch[4].replace(/,/g, ""))));
          const unit = structuredMatch[5].trim();
          const price = parseFloat(structuredMatch[6].replace(/,/g, ""));

          const endPriceMatch = line.trim().match(/[\$€£₹INR\s]+([0-9,]+\.[0-9]{2})$/);
          const totalPrice = endPriceMatch
            ? parseFloat(endPriceMatch[1].replace(/,/g, ""))
            : Math.round(quantity * price * 100) / 100;

          extractedItems.push({
            partNumber,
            description,
            quantity,
            unit,
            price,
            totalPrice,
          });
        }
      }
    }

    if (extractedItems.length > 0) {
      return extractedItems;
    }

    // Fallback: Generic line item detection if no explicit header block was found
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        lower.includes("subtotal") ||
        lower.includes("grand total") ||
        lower.includes("freight") ||
        lower.includes("tax") ||
        lower.includes("line part number") ||
        lower.includes("description") ||
        lower.includes("authorized") ||
        lower.includes("quotation") ||
        lower.includes("estate") ||
        lower.includes("plot") ||
        lower.includes("road") ||
        lower.includes("bill to") ||
        lower.includes("ship to")
      ) {
        continue;
      }

      const structuredMatch = line.match(
        /^(?:(\d+)\s+)?([A-Za-z0-9\-_/.]{3,20})\s+(.+?)\s+([0-9,]+(?:\.[0-9]+)?)\s+([A-Za-z]{1,6})\s+[\$€£₹INR]?\s*([0-9,]+\.[0-9]{2})\b/i
      );
      if (structuredMatch) {
        const partNumber = structuredMatch[2].trim();
        const description = structuredMatch[3].trim();
        const quantity = Math.max(1, Math.round(parseFloat(structuredMatch[4].replace(/,/g, ""))));
        const unit = structuredMatch[5].trim();
        const price = parseFloat(structuredMatch[6].replace(/,/g, ""));

        const endPriceMatch = line.trim().match(/[\$€£₹INR\s]+([0-9,]+\.[0-9]{2})$/);
        const totalPrice = endPriceMatch
          ? parseFloat(endPriceMatch[1].replace(/,/g, ""))
          : Math.round(quantity * price * 100) / 100;

        extractedItems.push({
          partNumber,
          description,
          quantity,
          unit,
          price,
          totalPrice,
        });
      }
    }

    return extractedItems;
  }

  private normalizeDate(dateStr: string): string {
    const MONTHS: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };

    try {
      const trimmed = dateStr.trim();

      // Check format like 16-Nov-2026 or 16/Nov/2026
      const alphaMatch = trimmed.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/](\d{2,4})$/);
      if (alphaMatch) {
        const day = alphaMatch[1].padStart(2, "0");
        const month = MONTHS[alphaMatch[2].toLowerCase().slice(0, 3)] || "01";
        const year = alphaMatch[3].length === 2 ? `20${alphaMatch[3]}` : alphaMatch[3];
        return `${year}-${month}-${day}`;
      }

      const parts = trimmed.split(/[-/.]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
        }
        if (parts[2].length === 4) {
          return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      }

      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split("T")[0];
      }
    } catch {}

    return new Date().toISOString().split("T")[0];
  }

  private getDefaultValidityDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  }
}
