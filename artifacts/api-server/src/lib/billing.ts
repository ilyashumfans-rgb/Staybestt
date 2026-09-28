export const MAX_MINOR_UNITS = 2_147_483_647;

export type InvoiceLineInput = {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps?: number;
};

export type ComputedInvoiceLine = InvoiceLineInput & {
  taxRateBps: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
};

export type InvoiceTotals = {
  lines: ComputedInvoiceLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
};

function assertSafeMinorUnits(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MINOR_UNITS) {
    throw new Error(`${label} must be a whole INR minor-unit amount within range`);
  }
}

/**
 * Compute every money total from integer paise values. The API never accepts
 * client-supplied subtotal, tax, total, paid, or due amounts.
 */
export function computeInvoiceTotals(lines: InvoiceLineInput[]): InvoiceTotals {
  if (lines.length === 0) {
    throw new Error("At least one invoice line item is required");
  }

  const computedLines = lines.map((line) => {
    if (
      typeof line.description !== "string" ||
      line.description.trim().length === 0 ||
      line.description.length > 500
    ) {
      throw new Error("Line item descriptions must be non-empty and at most 500 characters");
    }
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > MAX_MINOR_UNITS
    ) {
      throw new Error("Line item quantity must be a positive whole number");
    }
    assertSafeMinorUnits(line.unitPriceMinor, "Line item unit price");
    const taxRateBps = line.taxRateBps ?? 0;
    if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) {
      throw new Error("Line item tax rate must be between 0 and 10000 basis points");
    }

    const subtotalMinor = line.quantity * line.unitPriceMinor;
    assertSafeMinorUnits(subtotalMinor, "Line item subtotal");
    const taxMinor = Math.round((subtotalMinor * taxRateBps) / 10_000);
    assertSafeMinorUnits(taxMinor, "Line item tax");
    const totalMinor = subtotalMinor + taxMinor;
    assertSafeMinorUnits(totalMinor, "Line item total");

    return {
      ...line,
      description: line.description.trim(),
      taxRateBps,
      subtotalMinor,
      taxMinor,
      totalMinor,
    };
  });

  const subtotalMinor = computedLines.reduce((sum, line) => sum + line.subtotalMinor, 0);
  const taxMinor = computedLines.reduce((sum, line) => sum + line.taxMinor, 0);
  const totalMinor = subtotalMinor + taxMinor;
  assertSafeMinorUnits(subtotalMinor, "Invoice subtotal");
  assertSafeMinorUnits(taxMinor, "Invoice tax");
  assertSafeMinorUnits(totalMinor, "Invoice total");
  if (totalMinor <= 0) {
    throw new Error("Invoice total must be greater than zero");
  }

  return { lines: computedLines, subtotalMinor, taxMinor, totalMinor };
}

export function isInvoiceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function invoiceStatus(
  totalMinor: number,
  paidMinor: number,
  dueDate: string,
  today: string,
): "unpaid" | "partial" | "paid" | "overdue" {
  if (paidMinor >= totalMinor) return "paid";
  if (paidMinor > 0) return "partial";
  // Overdue is deliberately only an unpaid status. A partially paid invoice
  // remains partial even when its due date has passed.
  if (dueDate < today) return "overdue";
  return "unpaid";
}

export const BUSINESS_TIME_ZONE = "Asia/Kolkata";

export function currentBusinessDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

// Kept as a compatibility alias for existing invoice callers. Invoice
// business dates use the same India-local calendar as payment/refund guards.
export function currentDateUtc(): string {
  return currentBusinessDate();
}
