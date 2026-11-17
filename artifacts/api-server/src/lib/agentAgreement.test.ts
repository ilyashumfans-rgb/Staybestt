import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fillAgentAgreement, renderAgentAgreementText } from "./agentAgreement";

describe("agent partnership agreement", () => {
  it("rejects missing and unknown fields rather than issuing an incomplete contract", () => {
    expect(() => fillAgentAgreement("Name {{fullName}} / {{unknown}}", { fullName: "Test" })).toThrow("unknown");
    expect(() => fillAgentAgreement("Name {{fullName}}", { fullName: "" })).toThrow("fullName");
  });
  it("fills every supplied section and generates a readable PDF", async () => {
    const template = await readFile(new URL("../../assets/agent-partnership-agreement.txt", import.meta.url), "utf8");
    const fields = {
      companyName: "Example Company Private Limited", companyAddress: "1 Example Street, Bengaluru",
      companyEmail: "company@example.test", companyPhone: "0000000000", gst: "Not applicable",
      cin: "TEST-CIN", fullName: "Example Agent", fatherName: "Example Parent", email: "agent@example.test",
      address: "2 Example Street, Bengaluru", mobile: "0000000000", pan: "TEST-PAN",
      bank: "Example Bank, dummy account 0000, IFSC TEST0000000", commission: "10%",
      signatory: "Example Signatory", designation: "Director", date: "16/11/2026", agentId: "agent-example",
    };
    const filled = fillAgentAgreement(template, fields);
    expect(filled).not.toContain("{{");
    const bytes = await renderAgentAgreementText(filled, fields.agentId);
    const text = execFileSync("pdftotext", ["-", "-"], { input: bytes }).toString();
    for (const section of ["1. COMPANY DETAILS", "6. AGENT COMMISSION STRUCTURE", "17. DECLARATION", "18. SIGNATURES"]) {
      expect(text).toContain(section);
    }
    expect(text).toContain("Sender ID / Agreement No.: agent-example");
    expect(text).toContain("Example Agent");
    expect(text).toContain("16/11/2026");
    expect(text).toContain("10%");
    await writeFile("/tmp/agent-agreement-sample.pdf", bytes);
  }, 30000);
});
