import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MIKOSHI_TRACKER_WORKFLOW_PROMPT, MIKOSHI_TRACKER_WORKFLOW_RESOURCE } from "../../src/server/guidance";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../");
const workspaceSkillPath = path.resolve(repoRoot, "skills/mikoshi-tracker-mcp/SKILL.md");
const repoLocalSkillPath = path.resolve(repoRoot, ".agents/skills/mikoshi-tracker-mcp/SKILL.md");
const packageReadmePath = path.resolve(__dirname, "../../README.md");
const repoReadmePath = path.resolve(repoRoot, "README.md");
const integrationDocPath = path.resolve(repoRoot, "docs/ai-agent-integration.md");
const troubleshootingDocPath = path.resolve(repoRoot, "docs/openclaw-troubleshooting.md");
const validationChecklistPath = path.resolve(repoRoot, "docs/openclaw-validation-checklist.md");
const rootPackageJsonPath = path.resolve(repoRoot, "package.json");
const examplePath = path.resolve(__dirname, "../../examples/openclaw.jsonc");
const packageJsonPath = path.resolve(__dirname, "../../package.json");

describe("OpenClaw compatibility smoke", () => {
  it("ships an OpenClaw-visible workspace skill aligned with the existing guidance contract", async () => {
    await expect(access(workspaceSkillPath)).resolves.toBeUndefined();

    const [workspaceSkill, repoLocalSkill] = await Promise.all([
      readFile(workspaceSkillPath, "utf8"),
      readFile(repoLocalSkillPath, "utf8"),
    ]);

    expect(workspaceSkill).toContain("name: mikoshi-tracker-mcp");
    expect(workspaceSkill).toContain("primaryEnv: MIKOSHI_TRACKER_API_TOKEN");
    expect(workspaceSkill).toContain("MIKOSHI_TRACKER_API_URL");
    expect(workspaceSkill).toContain("MIKOSHI_TRACKER_API_TOKEN");
    expect(workspaceSkill).toContain("connect the MikoshiTracker MCP server first");
    expect(workspaceSkill).toContain("bootstrap-token");
    expect(workspaceSkill).toContain(MIKOSHI_TRACKER_WORKFLOW_PROMPT.name);
    expect(workspaceSkill).toContain(MIKOSHI_TRACKER_WORKFLOW_RESOURCE.uri);
    expect(workspaceSkill).toContain("today_get_summary");
    expect(workspaceSkill).toContain("read before write");

    expect(repoLocalSkill).toContain("skills/mikoshi-tracker-mcp/SKILL.md");
    expect(repoLocalSkill).toContain("bootstrap-token");
    expect(repoLocalSkill).toContain(MIKOSHI_TRACKER_WORKFLOW_PROMPT.name);
    expect(repoLocalSkill).toContain(MIKOSHI_TRACKER_WORKFLOW_RESOURCE.uri);
    expect(repoLocalSkill).toContain("today_get_summary");
    expect(repoLocalSkill).toContain("read before write");
  });

  it("ships one canonical OpenClaw example asset and keeps docs aligned with it", async () => {
    const [
      example,
      packageReadme,
      repoReadme,
      integrationDoc,
      troubleshootingDoc,
      validationChecklist,
      packageJsonRaw,
      rootPackageJsonRaw,
    ] = await Promise.all([
      readFile(examplePath, "utf8"),
      readFile(packageReadmePath, "utf8"),
      readFile(repoReadmePath, "utf8"),
      readFile(integrationDocPath, "utf8"),
      readFile(troubleshootingDocPath, "utf8"),
      readFile(validationChecklistPath, "utf8"),
      readFile(packageJsonPath, "utf8"),
      readFile(rootPackageJsonPath, "utf8"),
    ]);
    const packageJson = JSON.parse(packageJsonRaw) as { files?: string[] };
    const rootPackageJson = JSON.parse(rootPackageJsonRaw) as { scripts?: Record<string, string> };

    expect(example).toContain('"skills"');
    expect(example).toContain('"entries"');
    expect(example).toContain('"mikoshi-tracker-mcp"');
    expect(example).toContain('"mcpServers"');
    expect(example).toContain('"command": "npx"');
    expect(example).toContain('"args": ["-y", "@mikoshi-tracker/mcp"]');
    expect(example).toContain("MIKOSHI_TRACKER_API_URL");
    expect(example).toContain("MIKOSHI_TRACKER_API_TOKEN");
    expect(example).toContain(MIKOSHI_TRACKER_WORKFLOW_PROMPT.name);
    expect(example).toContain(MIKOSHI_TRACKER_WORKFLOW_RESOURCE.uri);
    expect(example).toContain("bootstrap-token");
    expect(example).toContain("Do not put account passwords");
    expect(packageJson.files).toContain("examples");

    expect(packageReadme).toContain("OpenClaw");
    expect(packageReadme).toContain("examples/openclaw.jsonc");
    expect(packageReadme).toContain("bootstrap-token");
    expect(packageReadme).toContain("openclaw-troubleshooting.md");
    expect(packageReadme).toContain("openclaw-validation-checklist.md");
    expect(packageReadme.indexOf("## Generic MCP Client Setup")).toBeGreaterThan(-1);
    expect(packageReadme.indexOf("## OpenClaw Setup")).toBeGreaterThan(
      packageReadme.indexOf("## Generic MCP Client Setup"),
    );

    expect(repoReadme).toContain("skills/mikoshi-tracker-mcp/SKILL.md");
    expect(repoReadme).toContain("bootstrap-token");
    expect(repoReadme).toContain("packages/mcp/examples/openclaw.jsonc");

    expect(integrationDoc).toContain("OpenClaw workspace skill discovery");
    expect(integrationDoc).toContain("Repo-local Skill-aware agent with MCP");
    expect(integrationDoc).toContain("bootstrap-token");
    expect(integrationDoc).toContain("MCP server configuration");
    expect(integrationDoc).toContain("Env/secret injection");
    expect(integrationDoc).toContain("packages/mcp/examples/openclaw.jsonc");
    expect(integrationDoc).toContain(MIKOSHI_TRACKER_WORKFLOW_PROMPT.name);
    expect(integrationDoc).toContain(MIKOSHI_TRACKER_WORKFLOW_RESOURCE.uri);
    expect(integrationDoc).toContain("openclaw-troubleshooting.md");

    expect(troubleshootingDoc).toContain("skill visible, tools missing");
    expect(troubleshootingDoc).toContain("MIKOSHI_TRACKER_API_TOKEN");
    expect(troubleshootingDoc).toContain("looks more like an email address");
    expect(troubleshootingDoc).toContain("bootstrap-token");
    expect(troubleshootingDoc).toContain("--force");

    expect(validationChecklist).toContain("token-ready setup");
    expect(validationChecklist).toContain("bootstrap-needed setup");
    expect(validationChecklist).toContain("today_get_summary");
    expect(validationChecklist).toContain("today_complete");
    expect(validationChecklist).toContain("MIKOSHI_TRACKER_API_TOKEN");
    expect(validationChecklist).toContain("external-host-only");
    expect(validationChecklist).toContain("pnpm verify:openclaw");
    expect(validationChecklist).toContain("pnpm verify:openclaw:full");

    expect(rootPackageJson.scripts?.["verify:openclaw"]).toBeTruthy();
    expect(rootPackageJson.scripts?.["verify:openclaw:full"]).toBeTruthy();
  });
});
