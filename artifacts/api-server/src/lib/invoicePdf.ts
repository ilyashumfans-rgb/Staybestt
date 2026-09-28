import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

type PdfSettings = {
  businessName: string;
  address: string;
  taxRegistration: string | null;
};

type PdfLine = {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
  taxMinor: number;
  totalMinor: number;
};

type PdfPayment = {
  amountMinor: number;
  paymentDate: string;
  method: string;
  reference: string | null;
};

type PdfRefund = {
  amountMinor: number;
  refundDate: string;
  method: string;
  reason: string;
  reference: string | null;
};

export type InvoicePdfInput = {
  settings: PdfSettings;
  invoice: {
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string | null;
    customerAddress: string | null;
    subtotalMinor: number;
    taxMinor: number;
    totalMinor: number;
    paidMinor: number;
    grossPaidMinor?: number;
    refundedMinor?: number;
    netPaidMinor?: number;
    dueMinor: number;
    status: string;
    lines: PdfLine[];
    payments: PdfPayment[];
    refunds?: PdfRefund[];
    booking: {
      bookingRef: string | null;
      propertyName: string;
      roomName: string;
      checkIn: string;
      checkOut: string;
      totalMinor: number;
    } | null;
  };
};

type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

type Layout = {
  pageWidth: number;
  pageHeight: number;
  left: number;
  right: number;
  bottom: number;
};

const COLORS = {
  navy: rgb(0.07, 0.12, 0.22),
  orange: rgb(0.97, 0.24, 0.02),
  muted: rgb(0.37, 0.42, 0.5),
  border: rgb(0.83, 0.86, 0.9),
  panel: rgb(0.96, 0.97, 0.98),
  white: rgb(1, 1, 1),
};

const FONT_REGULAR = "Inter_400Regular.ttf";
const FONT_BOLD = "Inter_700Bold.ttf";

function normalize(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function amount(minor: number): string {
  return `INR ${(minor / 100).toFixed(2)}`;
}

/**
 * Inter covers Latin, punctuation, and INR symbols but not every Unicode
 * script. Replace an unavailable code point with a visible square rather than
 * silently dropping it or asking a PDF consumer to guess a missing glyph.
 */
export function replaceMissingGlyphs(value: string, font: PDFFont): string {
  const characterSet = new Set(font.getCharacterSet());
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && characterSet.has(codePoint) ? character : "□";
  }).join("");
}

function fontFileCandidates(fileName: string): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const familyDirectory = fileName.includes("700") ? "700Bold" : "400Regular";
  return [
    path.resolve(here, "../assets", fileName),
    path.resolve(
      here,
      "../../node_modules/@expo-google-fonts/inter",
      familyDirectory,
      fileName,
    ),
    path.resolve(process.cwd(), "artifacts/api-server/assets", fileName),
    path.resolve(
      process.cwd(),
      `artifacts/api-server/node_modules/@expo-google-fonts/inter/${familyDirectory}`,
      fileName,
    ),
  ];
}

async function readBundledFont(fileName: string): Promise<Buffer> {
  for (const candidate of fontFileCandidates(fileName)) {
    try {
      return await readFile(candidate);
    } catch {
      // Try the next build/source location. The build copies both fonts into
      // the server artifact before bundling.
    }
  }
  throw new Error(`Invoice PDF font asset is unavailable: ${fileName}`);
}

async function embedFonts(document: PDFDocument): Promise<PdfFonts> {
  document.registerFontkit(fontkit);
  const [regularData, boldData] = await Promise.all([
    readBundledFont(FONT_REGULAR),
    readBundledFont(FONT_BOLD),
  ]);
  return {
    // Keep the full static TTFs instead of pdf-lib/fontkit subsetting. Some
    // PDF consumers render subsetted Inter cmap/CID mappings as random glyphs
    // even though pdftotext can still decode the character map.
    regular: await document.embedFont(regularData, { subset: false }),
    bold: await document.embedFont(boldData, { subset: false }),
  };
}

async function embedLogo(document: PDFDocument) {
  const candidates = [
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../assets/staybest-brand-tagline-1789131885718.png",
    ),
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../staybest/src/assets/staybest-brand-tagline-1789131885718.png",
    ),
    path.resolve(
      process.cwd(),
      "artifacts/api-server/assets/staybest-brand-tagline-1789131885718.png",
    ),
    path.resolve(
      process.cwd(),
      "artifacts/staybest/src/assets/staybest-brand-tagline-1789131885718.png",
    ),
  ];
  for (const candidate of candidates) {
    try {
      return await document.embedPng(await readFile(candidate));
    } catch {
      // Keep searching in source and built artifact locations.
    }
  }
  return null;
}

function wrapText(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const text = replaceMissingGlyphs(value, font).trim();
  if (!text) return [""];
  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/u);
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/u).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = "";
      // Keep long reference IDs and URLs visible by breaking them at glyph
      // boundaries instead of truncating them.
      for (const character of Array.from(word)) {
        const next = current + character;
        if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
          lines.push(current);
          current = character;
        } else {
          current = next;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = COLORS.navy,
): void {
  page.drawText(replaceMissingGlyphs(text, font), { x, y, font, size, color });
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  lineHeight = size * 1.35,
  color = COLORS.navy,
): number {
  const lines = wrapText(text, font, size, width);
  lines.forEach((line, index) => {
    drawText(page, line, x, y - index * lineHeight, font, size, color);
  });
  return lines.length * lineHeight;
}

function drawRule(page: PDFPage, x1: number, y: number, x2: number): void {
  page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness: 0.6,
    color: COLORS.border,
  });
}

function drawFooter(
  page: PDFPage,
  layout: Layout,
  fonts: PdfFonts,
  pageNumber: number,
  pageCount: number,
): void {
  drawRule(page, layout.left, 42, layout.right);
  drawText(
    page,
    "StayBest · Manual billing record · No online payment gateway was used",
    layout.left,
    27,
    fonts.regular,
    7.5,
    COLORS.muted,
  );
  drawText(
    page,
    `Page ${pageNumber} of ${pageCount}`,
    layout.right - 70,
    27,
    fonts.regular,
    7.5,
    COLORS.muted,
  );
}

function drawHeader(
  page: PDFPage,
  layout: Layout,
  fonts: PdfFonts,
  invoice: InvoicePdfInput["invoice"],
  settings: PdfSettings,
  logo: Awaited<ReturnType<typeof embedLogo>>,
  continuation: boolean,
): number {
  const top = layout.pageHeight - 42;
  if (logo) {
    const logoHeight = 54;
    const logoWidth = (logo.width / logo.height) * logoHeight;
    page.drawImage(logo, {
      x: layout.left,
      y: top - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
  }
  drawText(page, "StayBest", layout.right - 155, top - 4, fonts.bold, 17);
  drawText(page, continuation ? "INVOICE · CONTINUED" : "INVOICE", layout.right - 155, top - 29, fonts.bold, 14);
  drawRule(page, layout.left, top - 69, layout.right);

  if (continuation) {
    drawText(
      page,
      `Invoice no. ${invoice.invoiceNumber}`,
      layout.left,
      top - 91,
      fonts.regular,
      9,
    );
    return top - 112;
  }

  const detailsY = top - 91;
  const businessHeight = drawWrapped(
    page,
    normalize(settings.businessName),
    layout.left,
    detailsY,
    240,
    fonts.bold,
    10.5,
  );
  const addressHeight = drawWrapped(
    page,
    normalize(settings.address),
    layout.left,
    detailsY - businessHeight - 4,
    240,
    fonts.regular,
    8,
    11,
    COLORS.muted,
  );
  let taxHeight = 0;
  if (settings.taxRegistration) {
    taxHeight = drawWrapped(
      page,
      `Tax registration: ${normalize(settings.taxRegistration)}`,
      layout.left,
      detailsY - businessHeight - addressHeight - 8,
      240,
      fonts.regular,
      8,
      11,
      COLORS.muted,
    );
  }
  drawText(page, `Invoice no. ${invoice.invoiceNumber}`, layout.right - 155, detailsY, fonts.regular, 8.5);
  drawText(page, `Invoice date ${invoice.issueDate}`, layout.right - 155, detailsY - 15, fonts.regular, 8.5);
  drawText(page, `Due date ${invoice.dueDate}`, layout.right - 155, detailsY - 30, fonts.regular, 8.5);
  drawText(page, `Status ${invoice.status.toUpperCase()}`, layout.right - 155, detailsY - 45, fonts.bold, 8.5);

  const customerTop = detailsY - Math.max(businessHeight + addressHeight + taxHeight + 34, 66);
  const customerLines = [
    normalize(invoice.customerName),
    normalize(invoice.customerEmail),
    invoice.customerPhone ? normalize(invoice.customerPhone) : "",
    invoice.customerAddress ? normalize(invoice.customerAddress) : "",
  ].filter(Boolean);
  const customerLineGroups = customerLines.map((line) =>
    wrapText(line, fonts.regular, 8.5, layout.right - layout.left - 20),
  );
  const customerHeight = Math.max(
    62,
    30 + customerLineGroups.reduce((height, lines) => height + lines.length * 10.5, 0),
  );
  page.drawRectangle({
    x: layout.left,
    y: customerTop - customerHeight,
    width: layout.right - layout.left,
    height: customerHeight,
    color: COLORS.panel,
  });
  drawText(page, "BILLED TO", layout.left + 10, customerTop - 17, fonts.bold, 7.5, COLORS.muted);
  let customerY = customerTop - 33;
  for (const lines of customerLineGroups) {
    lines.forEach((line, index) => {
      drawText(page, line, layout.left + 10, customerY - index * 10.5, fonts.regular, 8.5);
    });
    customerY -= lines.length * 10.5;
  }
  return customerTop - customerHeight - 22;
}

function drawTableHeader(page: PDFPage, layout: Layout, fonts: PdfFonts, y: number): number {
  drawText(page, "DESCRIPTION", layout.left, y, fonts.bold, 7.5, COLORS.muted);
  drawText(page, "QTY", 316, y, fonts.bold, 7.5, COLORS.muted);
  drawText(page, "UNIT", 355, y, fonts.bold, 7.5, COLORS.muted);
  drawText(page, "TAX", 438, y, fonts.bold, 7.5, COLORS.muted);
  drawText(page, "TOTAL", 500, y, fonts.bold, 7.5, COLORS.muted);
  drawRule(page, layout.left, y - 8, layout.right);
  return y - 24;
}

function drawTotals(
  page: PDFPage,
  layout: Layout,
  fonts: PdfFonts,
  invoice: InvoicePdfInput["invoice"],
  y: number,
): number {
  const top = y - 2;
  drawRule(page, 345, top, layout.right);
  const rows: Array<[string, string, PDFFont, number]> = [
    ["Subtotal", amount(invoice.subtotalMinor), fonts.regular, 8.5],
    ["Tax", amount(invoice.taxMinor), fonts.regular, 8.5],
    ["TOTAL", amount(invoice.totalMinor), fonts.bold, 10],
    ["Gross paid", amount(invoice.grossPaidMinor ?? invoice.paidMinor), fonts.regular, 8.5],
    ["Returned", amount(invoice.refundedMinor ?? 0), fonts.regular, 8.5],
    [
      "Net received",
      amount(invoice.netPaidMinor ?? Math.max(0, invoice.paidMinor - (invoice.refundedMinor ?? 0))),
      fonts.regular,
      8.5,
    ],
    ["Balance due (original unpaid)", amount(invoice.dueMinor), fonts.bold, 10],
  ];
  let rowY = top - 18;
  rows.forEach(([label, value, font, size], index) => {
    if (index === 2) drawRule(page, 390, rowY + 9, layout.right);
    drawText(page, label, 390, rowY, font, size);
    drawText(page, value, 500, rowY, font, size);
    rowY -= index === 2 || index === 6 ? 22 : 17;
  });
  return rowY - 4;
}

export async function generateInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const document = await PDFDocument.create();
  const fonts = await embedFonts(document);
  const logo = await embedLogo(document);
  const layout: Layout = {
    pageWidth: 595,
    pageHeight: 842,
    left: 40,
    right: 555,
    bottom: 58,
  };
  const pages: PDFPage[] = [];
  let page = document.addPage([layout.pageWidth, layout.pageHeight]);
  pages.push(page);
  let y = drawHeader(page, layout, fonts, input.invoice, input.settings, logo, false);
  if (input.invoice.booking) {
    const booking = input.invoice.booking;
    const bookingText =
      `${normalize(booking.propertyName)} · ${normalize(booking.roomName)}\n` +
      `Booking ${normalize(booking.bookingRef ?? "payment capture")} · ${booking.checkIn} to ${booking.checkOut} · ${amount(booking.totalMinor)}`;
    page.drawRectangle({
      x: layout.left,
      y: y - 42,
      width: layout.right - layout.left,
      height: 42,
      color: COLORS.panel,
    });
    drawText(page, "STAY", layout.left + 10, y - 16, fonts.bold, 7.5, COLORS.muted);
    drawWrapped(page, bookingText, layout.left + 54, y - 16, layout.right - layout.left - 64, fonts.regular, 8.5, 11);
    y -= 60;
  }
  y = drawTableHeader(page, layout, fonts, y);

  for (const line of input.invoice.lines) {
    const descriptionLines = wrapText(normalize(line.description), fonts.regular, 8.5, 255);
    const rowHeight = Math.max(19, descriptionLines.length * 11 + 6);
    if (y - rowHeight < layout.bottom + 40) {
      page = document.addPage([layout.pageWidth, layout.pageHeight]);
      pages.push(page);
      y = drawHeader(page, layout, fonts, input.invoice, input.settings, logo, true);
      y = drawTableHeader(page, layout, fonts, y);
    }
    descriptionLines.forEach((description, index) => {
      drawText(page, description, layout.left, y - index * 11, fonts.regular, 8.5);
    });
    drawText(page, String(line.quantity), 316, y, fonts.regular, 8.5);
    drawText(page, amount(line.unitPriceMinor), 355, y, fonts.regular, 8.5);
    drawText(page, `${(line.taxRateBps / 100).toFixed(2)}%`, 438, y, fonts.regular, 8.5);
    drawText(page, amount(line.totalMinor), 500, y, fonts.regular, 8.5);
    y -= rowHeight;
  }

  // Seven total rows consume 153pt from the incoming baseline. Keep a small
  // additional guard above the footer reserve so the final balance row and its
  // descender cannot collide with the footer rule.
  const totalsReserve = 160;
  if (y - totalsReserve < layout.bottom + 40) {
    page = document.addPage([layout.pageWidth, layout.pageHeight]);
    pages.push(page);
    y = drawHeader(page, layout, fonts, input.invoice, input.settings, logo, true);
  }
  y = drawTotals(page, layout, fonts, input.invoice, y);

  if (input.invoice.payments.length > 0) {
    if (y - 32 < layout.bottom + 40) {
      page = document.addPage([layout.pageWidth, layout.pageHeight]);
      pages.push(page);
      y = drawHeader(page, layout, fonts, input.invoice, input.settings, logo, true);
    }
    drawText(page, "MANUAL PAYMENTS", layout.left, y, fonts.bold, 8, COLORS.muted);
    y -= 18;
    for (const payment of input.invoice.payments) {
      const reference = payment.reference ? normalize(payment.reference) : "—";
      const referenceLines = wrapText(reference, fonts.regular, 8, 225);
      const rowHeight = Math.max(16, referenceLines.length * 10 + 4);
      if (y - rowHeight < layout.bottom + 40) {
        page = document.addPage([layout.pageWidth, layout.pageHeight]);
        pages.push(page);
        y = drawHeader(page, layout, fonts, input.invoice, input.settings, logo, true);
        drawText(page, "MANUAL PAYMENTS · CONTINUED", layout.left, y, fonts.bold, 8, COLORS.muted);
        y -= 18;
      }
      drawText(page, payment.paymentDate, layout.left, y, fonts.regular, 8);
      drawText(page, payment.method.toUpperCase(), 112, y, fonts.regular, 8);
      drawText(page, amount(payment.amountMinor), 190, y, fonts.regular, 8);
      referenceLines.forEach((line, index) => {
        drawText(page, line, 310, y - index * 10, fonts.regular, 8);
      });
      y -= rowHeight;
    }
  }

  const refunds = input.invoice.refunds ?? [];
  if (refunds.length > 0) {
    if (y - 32 < layout.bottom + 40) {
      page = document.addPage([layout.pageWidth, layout.pageHeight]);
      pages.push(page);
      y = drawHeader(page, layout, fonts, input.invoice, input.settings, logo, true);
    }
    drawText(page, "COMPLETED MANUAL REFUNDS", layout.left, y, fonts.bold, 8, COLORS.muted);
    y -= 18;
    for (const refund of refunds) {
      const reason = normalize(
        refund.reference ? `${refund.reason} · ${refund.reference}` : refund.reason,
      );
      const reasonLines = wrapText(reason, fonts.regular, 8, 225);
      const rowHeight = Math.max(16, reasonLines.length * 10 + 4);
      if (y - rowHeight < layout.bottom + 40) {
        page = document.addPage([layout.pageWidth, layout.pageHeight]);
        pages.push(page);
        y = drawHeader(page, layout, fonts, input.invoice, input.settings, logo, true);
        drawText(page, "COMPLETED MANUAL REFUNDS · CONTINUED", layout.left, y, fonts.bold, 8, COLORS.muted);
        y -= 18;
      }
      drawText(page, refund.refundDate, layout.left, y, fonts.regular, 8);
      drawText(page, refund.method.toUpperCase(), 112, y, fonts.regular, 8);
      drawText(page, amount(refund.amountMinor), 190, y, fonts.regular, 8);
      reasonLines.forEach((line, index) => {
        drawText(page, line, 310, y - index * 10, fonts.regular, 8);
      });
      y -= rowHeight;
    }
  }

  const pageCount = pages.length;
  pages.forEach((pdfPage, index) => {
    drawFooter(pdfPage, layout, fonts, index + 1, pageCount);
  });
  return Buffer.from(await document.save());
}