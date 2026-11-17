import { it, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";

const state = vi.hoisted(() => ({ wording: "Shared agreement version one" }));
vi.mock("@workspace/db", async importOriginal => {
  const original = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...original,
    db: {
      select: () => ({
        from: (table: unknown) => {
          const rows = () => table === original.agentAgreementTemplateTable
            ? [{ template: `${state.wording}\nName: {{fullName}}\nSender ID: {{agentId}}\nDate: {{date}}\nSignature: ____________________`, cin: "", signatory: "", designation: "" }]
            : table === original.agentAgreementProfilesTable
              ? [{ details: { template: "OBSOLETE INDIVIDUAL WORDING", cin: "OLD INDIVIDUAL CIN" } }]
              : [];
          return { limit: async () => rows(), where: () => ({ limit: async () => rows() }) };
        },
      }),
    },
  };
});
import { renderAgentAgreement, getAgentAgreementDetails } from "./agentAgreement";
import type { User } from "@workspace/db";

it("uses one updated agreement for both agents and never uses legacy per-agent wording", async () => {
  const agent = (id: string) => ({ id, name: `Agent ${id}`, email: `${id}@example.test`, role: "agent" }) as User;
  expect(await getAgentAgreementDetails(agent("one"))).not.toHaveProperty("template");
  const first = execFileSync("pdftotext", ["-", "-"], { input: await renderAgentAgreement(agent("one")) }).toString();
  expect(first).toContain("Shared agreement version one");
  state.wording = "Shared agreement version two";
  for (const id of ["one", "two"]) {
    const text = execFileSync("pdftotext", ["-", "-"], { input: await renderAgentAgreement(agent(id)) }).toString();
    expect(text).toContain("Shared agreement version two");
    expect(text).toContain(`Agent ${id}`);
    expect(text).not.toContain("OBSOLETE INDIVIDUAL");
  }
}, 30000);
