function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stripNullishFields(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(stripNullishFields).filter((item) => item !== undefined);
  }
  if (!isRecord(value)) {
    return value;
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key, stripNullishFields(entryValue)] as const)
    .filter(([, entryValue]) => entryValue !== undefined);
  return Object.fromEntries(entries);
}

export function normalizePmoToolInput(value: unknown): unknown {
  return normalizeTopLevelAliases(stripNullishFields(value));
}

export function normalizePmoMacroInput(value: unknown): unknown {
  const normalized = normalizePmoToolInput(value);
  if (!isRecord(normalized)) {
    return normalized;
  }

  const request = { ...normalized };
  if (typeof request.macroName === "string" && typeof request.macroId !== "string") {
    request.macroId = `macro://pmo/${request.macroName}`;
  }
  if (request.macroInput !== undefined && request.input === undefined) {
    request.input = request.macroInput;
  }
  return request;
}

export function normalizePmoReadModel<T>(value: T): T {
  return stripNullishFields(value) as T;
}

export function normalizePmoReadModels<T>(values: T[]): T[] {
  return values.map((value) => normalizePmoReadModel(value));
}

function normalizeTopLevelAliases(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const normalized = { ...value };
  if (typeof normalized.projectId === "string" && normalized.projectIds === undefined) {
    normalized.projectIds = [normalized.projectId];
    delete normalized.projectId;
  }
  if (typeof normalized.targetRef === "string" && normalized.targetRefs === undefined) {
    normalized.targetRefs = [normalized.targetRef];
    delete normalized.targetRef;
  }
  if (isRecord(normalized.input)) {
    normalized.input = normalizeTargetRefAlias(normalized.input);
  }
  if (isRecord(normalized.macroInput)) {
    normalized.macroInput = normalizeTargetRefAlias(normalized.macroInput);
  }
  if (isRecord(normalized.integration)) {
    normalized.integration = normalizeIntegrationAliases(normalized.integration);
  }

  return normalized;
}

function normalizeTargetRefAlias(value: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...value };
  if (typeof normalized.targetRef === "string" && normalized.targetRefs === undefined) {
    normalized.targetRefs = [normalized.targetRef];
    delete normalized.targetRef;
  }
  return normalized;
}

function normalizeIntegrationAliases(value: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...value };
  if (typeof normalized.consumerProjectId === "string" && normalized.consumerProjectIds === undefined) {
    normalized.consumerProjectIds = [normalized.consumerProjectId];
    delete normalized.consumerProjectId;
  }
  return normalized;
}
