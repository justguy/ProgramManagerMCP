export const DEFAULT_REDACTION_POLICY_REFS = ["policy://redaction/pointer-only-v1"];

export const PROHIBITED_INLINE_KINDS = [
  "credentials",
  "logs",
  "product_rows",
  "provider_transcripts",
  "scratchpads",
  "screenshots",
  "secrets",
  "session_data",
  "traces"
] as const;

type RedactionSummary = {
  redacted: boolean;
  omittedKinds: string[];
  policyRefs: string[];
};

const PROHIBITED_KEY_TO_KIND = new Map<string, string>([
  ["credential", "credentials"],
  ["credentials", "credentials"],
  ["log", "logs"],
  ["logs", "logs"],
  ["productRow", "product_rows"],
  ["productRows", "product_rows"],
  ["providerTranscript", "provider_transcripts"],
  ["providerTranscripts", "provider_transcripts"],
  ["rawLog", "logs"],
  ["rawLogs", "logs"],
  ["scratchpad", "scratchpads"],
  ["scratchpads", "scratchpads"],
  ["screenshot", "screenshots"],
  ["screenshots", "screenshots"],
  ["secret", "secrets"],
  ["secrets", "secrets"],
  ["session", "session_data"],
  ["sessionData", "session_data"],
  ["trace", "traces"],
  ["traces", "traces"],
  ["transcript", "provider_transcripts"],
  ["transcripts", "provider_transcripts"]
]);

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function omitBodyLikeField(key: string): boolean {
  return /(body|content)$/i.test(key);
}

export function buildRedactionSummary(
  summary: Partial<RedactionSummary> = {}
): RedactionSummary {
  const omittedKinds = sortUnique(summary.omittedKinds ?? []);
  const policyRefs = sortUnique(summary.policyRefs ?? DEFAULT_REDACTION_POLICY_REFS);

  return {
    redacted: Boolean(summary.redacted) || omittedKinds.length > 0,
    omittedKinds,
    policyRefs
  };
}

export function mergeRedactionSummaries(
  ...summaries: Array<Partial<RedactionSummary> | undefined>
): RedactionSummary {
  const omittedKinds = sortUnique(
    summaries.flatMap((summary) => summary?.omittedKinds ?? [])
  );
  const policyRefs = sortUnique(
    summaries.flatMap((summary) => summary?.policyRefs ?? DEFAULT_REDACTION_POLICY_REFS)
  );

  return {
    redacted:
      summaries.some((summary) => Boolean(summary?.redacted)) || omittedKinds.length > 0,
    omittedKinds,
    policyRefs
  };
}

export function sanitizePointerPayload<T>(
  input: T,
  policyRefs: string[] = DEFAULT_REDACTION_POLICY_REFS
): { value: T; redactionSummary: RedactionSummary } {
  const omittedKinds = new Set<string>();

  function walk(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => walk(entry));
    }

    if (!isObject(value)) {
      return value;
    }

    const output: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
      const prohibitedKind = PROHIBITED_KEY_TO_KIND.get(key);
      if (prohibitedKind) {
        omittedKinds.add(prohibitedKind);
        continue;
      }

      if (omitBodyLikeField(key)) {
        omittedKinds.add("content_body");
        continue;
      }

      output[key] = walk(child);
    }

    return output;
  }

  const value = walk(input) as T;
  return {
    value,
    redactionSummary: buildRedactionSummary({
      redacted: omittedKinds.size > 0,
      omittedKinds: [...omittedKinds],
      policyRefs
    })
  };
}
