import { parseDocument } from "yaml";

export interface YamlValidationResult {
  ok: boolean;
  message: string | null;
}

export function validateYaml(input: string): YamlValidationResult {
  if (!input.trim()) {
    return { ok: false, message: "YAML is empty" };
  }

  try {
    const doc = parseDocument(input, { prettyErrors: true });
    const issue = doc.errors[0] ?? doc.warnings[0];
    if (!issue) return { ok: true, message: null };

    const message = issue.message || String(issue);
    const linePos = issue.linePos?.[0];
    if (linePos) {
      return { ok: false, message: `YAML error at line ${linePos.line}, column ${linePos.col}: ${message}` };
    }
    return { ok: false, message: `YAML error: ${message}` };
  } catch (error) {
    return { ok: false, message: `YAML error: ${(error as Error).message}` };
  }
}
