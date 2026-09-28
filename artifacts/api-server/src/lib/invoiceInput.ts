function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizeOptionalString(value: unknown): unknown {
  return typeof value === "string" ? normalizeWhitespace(value) : value;
}

export function normalizeBillingSettingsBody(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  return {
    ...body,
    businessName: normalizeOptionalString(body.businessName),
    address: normalizeOptionalString(body.address),
    taxRegistration: normalizeOptionalString(body.taxRegistration),
  };
}

export function normalizeInvoiceBody(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  const lineItems = Array.isArray(body.lineItems)
    ? body.lineItems.map((line) => {
        if (!line || typeof line !== "object" || Array.isArray(line)) return line;
        const item = line as Record<string, unknown>;
        return {
          ...item,
          description: normalizeOptionalString(item.description),
        };
      })
    : body.lineItems;
  const customerEmail = normalizeOptionalString(body.customerEmail);
  return {
    ...body,
    customerName: normalizeOptionalString(body.customerName),
    customerEmail: typeof customerEmail === "string" ? customerEmail.toLowerCase() : customerEmail,
    customerPhone: normalizeOptionalString(body.customerPhone),
    customerAddress: normalizeOptionalString(body.customerAddress),
    issueDate: normalizeOptionalString(body.issueDate),
    dueDate: normalizeOptionalString(body.dueDate),
    lineItems,
  };
}

export function normalizePaymentBody(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  return {
    ...body,
    paymentDate: normalizeOptionalString(body.paymentDate),
    reference: normalizeOptionalString(body.reference),
    idempotencyKey: normalizeOptionalString(body.idempotencyKey),
  };
}