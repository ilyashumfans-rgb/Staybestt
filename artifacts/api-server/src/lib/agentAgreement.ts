import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db, agentAgreementProfilesTable, agentAgreementTemplateTable, billingSettingsTable, commercialTermsTable, partnerProfilesTable, type User } from "@workspace/db";
import { PDFDocument, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  import.meta.url.includes("/src/lib/") ? "../../assets" : "../assets");

export async function getSharedAgentAgreement() {
  const [saved] = await db.select().from(agentAgreementTemplateTable).where(eq(agentAgreementTemplateTable.id, 1)).limit(1);
  return {
    template: saved?.template ?? await readFile(path.join(assets, "agent-partnership-agreement.txt"), "utf8"),
    cin: saved?.cin ?? "", signatory: saved?.signatory ?? "", designation: saved?.designation ?? "",
  };
}

export async function getAgentAgreementDetails(agent: User) {
  const [[saved], [profile], [terms]] = await Promise.all([
    db.select().from(agentAgreementProfilesTable).where(eq(agentAgreementProfilesTable.agentId, agent.id)).limit(1),
    db.select().from(partnerProfilesTable).where(eq(partnerProfilesTable.userId, agent.id)).limit(1),
    db.select().from(commercialTermsTable).where(eq(commercialTermsTable.userId, agent.id)).limit(1),
  ]);
  const defaults = {
    fullName: agent.name, email: agent.email, fatherName: "", address: profile?.address ?? "",
    mobile: profile?.contactPhone ?? "", pan: "",
    bank: [profile?.bankAccountName, profile?.bankAccountNumber, profile?.bankIfsc, profile?.bankName].filter(Boolean).join(", "),
    commission: terms ? (terms.mode === "fixed" ? `INR ${terms.value} fixed` : `${terms.value}%`) : "",
  };
  return Object.fromEntries(Object.entries(defaults).map(([key, value]) =>
    [key, saved?.details[key] || value])) as typeof defaults;
}

export class IncompleteAgentAgreement extends Error {}

export function fillAgentAgreement(template: string, values: Record<string, string>) {
  const missing = new Set<string>();
  const filled = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!values[key]?.trim()) missing.add(key);
    return values[key] ?? "";
  });
  if (missing.size) throw new IncompleteAgentAgreement(`Complete these agreement details before downloading: ${[...missing].join(", ")}. Company details are in Billing Settings; agent details are in Agent Management → Edit agreement.`);
  return filled;
}

export async function renderAgentAgreementText(text: string, agentId: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(await readFile(path.join(assets, "Inter_400Regular.ttf")));
  const bold = await pdf.embedFont(await readFile(path.join(assets, "Inter_700Bold.ttf")));
  const width = 595.28, height = 841.89, margin = 48;
  let page = pdf.addPage([width, height]), y = height - 72;
  const header = () => {
    page.drawText("STAYBESTT | AGENT PARTNERSHIP AGREEMENT", { x: margin, y: height - 32, size: 10, font: bold });
    page.drawText(`Sender ID / Agreement No.: ${agentId}`, { x: margin, y: height - 47, size: 8, font: regular });
  };
  header();
  const drawLine = (line: string, font: PDFFont, size: number) => {
    if (y < 65) { page = pdf.addPage([width, height]); y = height - 72; header(); }
    page.drawText(line, { x: margin, y, font, size });
    y -= 17;
  };
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) { y -= 10; continue; }
    const heading = /^\d+\.\s+[A-Z][A-Z\s]+$|^AGENT PARTNERSHIP AGREEMENT$/.test(raw);
    const font = heading ? bold : regular, size = heading ? 12 : 11;
    let line = "";
    // Wrap even unbroken IDs and bank details instead of clipping.
    for (const word of raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width - margin * 2) { line = next; continue; }
      if (line) drawLine(line, font, size);
      line = "";
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > width - margin * 2) {
          drawLine(line, font, size); line = "";
        }
        line += char;
      }
    }
    if (line) drawLine(line, font, size);
    if (raw.startsWith("Signature:") || raw === "Company Seal:") y -= 24;
  }
  pdf.getPages().forEach((p, i) => p.drawText(`Agent Partnership Agreement | Page ${i + 1} of ${pdf.getPageCount()}`, {
    x: margin, y: 28, size: 8, font: regular,
  }));
  return Buffer.from(await pdf.save());
}

export async function renderAgentAgreement(agent: User) {
  const details = await getAgentAgreementDetails(agent);
  const shared = await getSharedAgentAgreement();
  const [company] = await db.select().from(billingSettingsTable).limit(1);
  const values = {
    ...details, ...shared, agentId: agent.id,
    date: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata" }).format(new Date()),
    companyName: company?.businessName ?? "", companyAddress: company?.address ?? "",
    gst: company?.taxRegistration || "Not registered / not applicable",
    companyEmail: company?.email ?? "", companyPhone: company?.phone ?? "",
  };
  return renderAgentAgreementText(fillAgentAgreement(shared.template, values), agent.id);
}
