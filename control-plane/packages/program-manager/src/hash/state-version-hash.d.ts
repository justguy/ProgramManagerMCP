export function canonicalizeForStateVersionHash(value: unknown): unknown;
export function sha256ForInput(input: unknown): string;
export function stateVersionHashFromInput(input: unknown): string;
export function collectNondeterministicHashKeys(value: unknown, path?: string[]): string[];
export function isSortedByField(entries: Array<Record<string, string>>, field: string): boolean;
