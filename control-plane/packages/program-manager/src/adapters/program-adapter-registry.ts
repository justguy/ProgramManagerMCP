export type AdapterHealthStatus = "healthy" | "degraded" | "stale" | "unavailable" | "circuit_open";
export type AdapterManifestStatus =
  | "healthy"
  | "degraded"
  | "stale"
  | "unavailable"
  | "circuit_open";

export type AdapterMethods = {
  reconcileState: boolean;
  readState: boolean;
  describeCapabilities: boolean;
  produceEvidenceRefs: boolean;
  getHealth: boolean;
  getObservationSchema: boolean;
  assessImpact: boolean;
  getSourceCursor: boolean;
};

export type AdapterManifest = {
  adapterId: string;
  adapterVersion: string;
  displayName: string;
  capabilityDomains: string[];
  supportedProjects: string[];
  sideEffectPosture: "read_only" | "describes_actions_only" | "mutation_capable_not_exposed";
  phase1aEnabled: boolean;
  authScopes: string[];
  evidenceTypes: string[];
  redactionPolicyRefs: string[];
  maxStaleCursorSeconds: number;
  healthModel: {
    statuses: AdapterManifestStatus[];
    circuitOpenAfterFailures: number;
    circuitOpenSeconds: number;
  };
  methods: AdapterMethods;
};

export type AdapterRedactionSummary = {
  redacted: boolean;
  omittedKinds: string[];
  policyRefs: string[];
};

export type AdapterReadStateObservation = {
  kind: string;
  ref: string;
  reason: string;
  status: string;
  evidenceRefs: string[];
  artifactRefs?: string[];
  summary?: string;
};

export type AdapterReadStateRequest = {
  requestId: string;
  portfolioId: string;
  programId?: string;
  projectIds?: string[];
  targetRefs: string[];
  limit?: number;
  contextAnchor?: {
    asOf?: string;
  };
};

export type AdapterReadStateResult = {
  adapterId: string;
  sourceCursor: string;
  observedAt: string;
  observations: AdapterReadStateObservation[];
  artifactRefs: string[];
  evidenceRefs: string[];
  truncated: boolean;
  omittedRefCount: number;
  omittedRefs: string[];
  redactionSummary: AdapterRedactionSummary;
};

export type AdapterImpactRequest = {
  requestId: string;
  portfolioId: string;
  programId?: string;
  changeRef: string;
  changeKind: string;
  targetRefs: string[];
  traversalBudgetRef: string;
  contextAnchor?: {
    asOf?: string;
  };
};

export type AdapterImpactFinding = {
  findingId: string;
  severity: "low" | "medium" | "high" | "critical";
  type: string;
  evidenceRefs: string[];
  summary?: string;
};

export type AdapterImpactResult = {
  adapterId: string;
  status: "ok" | "warning" | "blocked" | "error" | "degraded";
  sourceCursor: string;
  affectedRefs: Array<{ kind: string; ref: string; reason: string }>;
  findings: AdapterImpactFinding[];
  evidenceRefs: string[];
  artifactRefs: string[];
  redactionSummary: AdapterRedactionSummary;
  requestId: string;
};

export type AdapterHealthResult = {
  adapterId: string;
  status: AdapterHealthStatus;
  reasons: string[];
  cursor: string;
  observedAt: string;
  checkedAt: string;
  maxStaleCursorSeconds: number;
};

export type AdapterCursor = {
  adapterId: string;
  portfolioId: string;
  cursor: string;
  observedAt: string;
  sourceRevisionHash: string;
  status: "current" | "stale" | "unavailable";
};

export type AdapterScope = {
  portfolioId: string;
  programId?: string;
  projectIds?: string[];
};

type AdapterReadCircuitState = {
  failures: number;
  openUntil: number | null;
  lastFailureAt: number | null;
};

export type ProgramAdapter = {
  manifest: AdapterManifest;
  describeCapabilities(): Promise<AdapterManifest>;
  getObservationSchema(domain: string, observationType: string): Promise<{ schemaVersion: "1"; domain: string; observationType: string }>;
  readState(request: AdapterReadStateRequest): Promise<AdapterReadStateResult>;
  assessImpact(request: AdapterImpactRequest): Promise<AdapterImpactResult>;
  reconcileState(scope: AdapterScope): Promise<AdapterReadStateResult>;
  produceEvidenceRefs(input: AdapterReadStateResult | AdapterImpactResult): Promise<string[]>;
  getSourceCursor(scope: AdapterScope, now?: string): Promise<AdapterCursor>;
  getHealth(scope: AdapterScope, now?: string): Promise<AdapterHealthResult>;
};

type TimestampedCursor = {
  cursor: string;
  sourceRevisionHash: string;
  observedAt: string;
};

function nowOrFallback(iso: string | undefined): Date {
  if (iso) {
    return new Date(iso);
  }
  return new Date("2026-05-03T12:00:00Z");
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function bounded<T extends { ref: string }>(values: T[], limit: number): {
  items: T[];
  truncated: boolean;
  omittedCount: number;
  omittedRefs: string[];
} {
  if (limit <= 0) {
    return {
      items: [],
      truncated: values.length > 0,
      omittedCount: values.length,
      omittedRefs: values.map((value) => value.ref)
    };
  }

  const items = values.slice(0, limit);
  const omittedRefs = values.slice(limit);

  return {
    items,
    truncated: omittedRefs.length > 0,
    omittedCount: omittedRefs.length,
    omittedRefs: omittedRefs.map((value) => value.ref)
  };
}

function redact<T extends { evidenceRefs?: string[]; artifactRefs?: string[] }>(
  entries: T[],
  policyRefs: string[],
  omittedKinds: string[]
): AdapterRedactionSummary {
  return {
    redacted: entries.some((entry) => entry.evidenceRefs?.length) || entries.some((entry) => entry.artifactRefs?.length),
    omittedKinds,
    policyRefs: sortedUnique(policyRefs)
  };
}

function collectRefs(entries: { evidenceRefs?: string[]; artifactRefs?: string[] }[]) {
  const evidenceRefs: string[] = [];
  const artifactRefs: string[] = [];

  for (const entry of entries) {
    evidenceRefs.push(...(entry.evidenceRefs ?? []));
    artifactRefs.push(...(entry.artifactRefs ?? []));
  }

  return {
    evidenceRefs: sortedUnique(evidenceRefs),
    artifactRefs: sortedUnique(artifactRefs)
  };
}

class ReadOnlyProgramAdapter implements ProgramAdapter {
  #adapterManifest: AdapterManifest;
  #cursor: TimestampedCursor;
  #observations: AdapterReadStateObservation[];

  constructor(
    adapterManifest: AdapterManifest,
    cursor: TimestampedCursor,
    observations: AdapterReadStateObservation[]
  ) {
    this.#adapterManifest = adapterManifest;
    this.#cursor = cursor;
    this.#observations = observations;
  }

  get manifest(): AdapterManifest {
    return this.#adapterManifest;
  }

  async describeCapabilities(): Promise<AdapterManifest> {
    return this.#adapterManifest;
  }

  async getObservationSchema(domain: string, observationType: string): Promise<{ schemaVersion: "1"; domain: string; observationType: string }> {
    return {
      schemaVersion: "1",
      domain,
      observationType
    };
  }

  async readState(request: AdapterReadStateRequest): Promise<AdapterReadStateResult> {
    const observationByRef = new Map(this.#observations.map((item) => [item.ref, item]));
    const matches = request.targetRefs.flatMap((targetRef) => {
      const found = observationByRef.get(targetRef);
      return found ? [found] : [];
    });
    const limit = request.limit ?? 10;
    const boundedMatches = bounded(matches, limit);
    const { artifactRefs, evidenceRefs } = collectRefs(boundedMatches.items);

    return {
      adapterId: this.#adapterManifest.adapterId,
      sourceCursor: this.#cursor.cursor,
      observedAt: this.#cursor.observedAt,
      observations: boundedMatches.items,
      artifactRefs,
      evidenceRefs,
      truncated: boundedMatches.truncated,
      omittedRefCount: boundedMatches.omittedCount,
      omittedRefs: boundedMatches.omittedRefs,
      redactionSummary: redact(boundedMatches.items, this.#adapterManifest.redactionPolicyRefs, ["content_body"])
    };
  }

  protected async getImpactsForTargets(_request: AdapterImpactRequest): Promise<Omit<AdapterImpactResult, "requestId">> {
    return {
      adapterId: this.#adapterManifest.adapterId,
      status: "ok",
      sourceCursor: this.#cursor.cursor,
      affectedRefs: [],
      findings: [],
      evidenceRefs: [],
      artifactRefs: [],
      redactionSummary: redact([], this.#adapterManifest.redactionPolicyRefs, [])
    };
  }

  async assessImpact(request: AdapterImpactRequest): Promise<AdapterImpactResult> {
    const base = await this.getImpactsForTargets(request);
    return { ...base, requestId: request.requestId };
  }

  async reconcileState(scope: AdapterScope): Promise<AdapterReadStateResult> {
    const request: AdapterReadStateRequest = {
      requestId: `reconcile:${scope.portfolioId}`,
      portfolioId: scope.portfolioId,
      programId: scope.programId,
      targetRefs: this.#observations.map((item) => item.ref),
      limit: 10
    };

    return this.readState(request);
  }

  async produceEvidenceRefs(input: AdapterReadStateResult | AdapterImpactResult): Promise<string[]> {
    return sortedUnique(input.evidenceRefs);
  }

  async getSourceCursor(scope: AdapterScope, now?: string): Promise<AdapterCursor> {
    const nowDate = nowOrFallback(now).valueOf();
    const observedAt = new Date(this.#cursor.observedAt).valueOf();
    const ageSeconds = Math.max(0, Math.floor((nowDate - observedAt) / 1000));

    return {
      adapterId: this.#adapterManifest.adapterId,
      portfolioId: scope.portfolioId,
      cursor: this.#cursor.cursor,
      observedAt: this.#cursor.observedAt,
      sourceRevisionHash: this.#cursor.sourceRevisionHash,
      status: ageSeconds > this.#adapterManifest.maxStaleCursorSeconds ? "stale" : "current"
    };
  }

  async getHealth(scope: AdapterScope, now?: string): Promise<AdapterHealthResult> {
    const cursor = await this.getSourceCursor(scope, now);
    const nowDate = nowOrFallback(now);
    const observedAt = new Date(cursor.observedAt);
    const ageSeconds = Math.max(0, Math.floor((nowDate.valueOf() - observedAt.valueOf()) / 1000));

    const reasons: string[] = [];
    let status: AdapterHealthStatus = "healthy";

    if (ageSeconds > this.#adapterManifest.maxStaleCursorSeconds) {
      status = "stale";
      reasons.push(`source cursor stale beyond max age of ${this.#adapterManifest.maxStaleCursorSeconds} seconds`);
    } else if (ageSeconds > Math.max(60, Math.floor(this.#adapterManifest.maxStaleCursorSeconds / 2))) {
      status = "degraded";
      reasons.push(`source cursor age ${ageSeconds}s`);
    }

    return {
      adapterId: this.#adapterManifest.adapterId,
      status,
      reasons,
      cursor: cursor.cursor,
      observedAt: cursor.observedAt,
      checkedAt: nowOrFallback(now).toISOString(),
      maxStaleCursorSeconds: this.#adapterManifest.maxStaleCursorSeconds
    };
  }
}

export type ProgramCapabilityListing = {
  capabilityId: string;
  phase: "1A" | "1B" | "1C" | "2" | "3" | "4";
  status: "available" | "planned" | "disabled" | "degraded";
  domains: string[];
  toolNames: string[];
  adapterIds: string[];
  evidencePolicyRefs: string[];
  sideEffectPosture: "read_only" | "pmo_internal_write" | "describes_actions_only";
};

export class HoplonAdapterStub extends ReadOnlyProgramAdapter {
  constructor() {
    super(
      {
        adapterId: "hoplon-local",
        adapterVersion: "1.0.0",
        authScopes: [
          "portfolio:default:read",
          "project:hoplon:read"
        ],
        capabilityDomains: [
          "code_context",
          "contract_context",
          "snapshot_context"
        ],
        displayName: "Hoplon Local Adapter",
        evidenceTypes: [
          "contract_snapshot",
          "hoplon_snapshot_ref"
        ],
        healthModel: {
          circuitOpenAfterFailures: 4,
          circuitOpenSeconds: 1800,
          statuses: [
            "circuit_open",
            "degraded",
            "stale",
            "healthy",
            "unavailable"
          ]
        },
        maxStaleCursorSeconds: 86400,
        methods: {
          assessImpact: true,
          describeCapabilities: true,
          getHealth: true,
          getObservationSchema: true,
          getSourceCursor: true,
          produceEvidenceRefs: true,
          readState: true,
          reconcileState: false
        },
        phase1aEnabled: true,
        redactionPolicyRefs: [
          "policy://redaction/pointer-only-v1"
        ],
        sideEffectPosture: "mutation_capable_not_exposed",
        supportedProjects: [
          "project://hoplon"
        ]
      },
      {
        cursor: "snapshot:s-2026-05-03",
        sourceRevisionHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        observedAt: "2026-05-03T12:00:00Z"
      },
      [
        {
          kind: "contract",
          ref: "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          reason: "active contract in tracker snapshot",
          status: "active",
          evidenceRefs: [
            "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          ],
          artifactRefs: [
            "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          ],
          summary: "Authorization contract from Hoplon snapshot."
        },
        {
          kind: "integration_point",
          ref: "integration://hoplon/authz-gateway",
          reason: "contract consumed by integration point",
          status: "active",
          evidenceRefs: [
            "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          ],
          summary: "Integration point for Hoplon authz contract consumption."
        },
        {
          kind: "project",
          ref: "project://program-manager-mcp",
          reason: "consumes_contract",
          status: "active",
          evidenceRefs: [
            "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          ]
        },
        {
          kind: "project",
          ref: "project://phalanx",
          reason: "consumes_contract",
          status: "active",
          evidenceRefs: [
            "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          ]
        },
        {
          kind: "policy",
          ref: "policy://active-adapters/hoplon-authz-tier1",
          reason: "policy bound to changed contract",
          status: "active",
          evidenceRefs: [
            "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          ]
        }
      ]
    );
  }

  protected override async getImpactsForTargets(request: AdapterImpactRequest): Promise<Omit<AdapterImpactResult, "requestId">> {
    const targetSet = new Set(request.targetRefs);
    const hasHoplonTarget = targetSet.has(
      "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    );

    if (!hasHoplonTarget) {
      return {
        adapterId: "hoplon-local",
        status: "ok",
        sourceCursor: "snapshot:s-2026-05-03",
        affectedRefs: [],
        findings: [],
        evidenceRefs: [],
        artifactRefs: [],
        redactionSummary: {
          redacted: true,
          omittedKinds: ["code_context_body"],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        }
      };
    }

    return {
      adapterId: "hoplon-local",
      status: "warning",
      sourceCursor: "snapshot:s-2026-05-03",
      affectedRefs: [
        {
          kind: "contract",
          ref: "contract://hoplon-authz/escalation-grant@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          reason: "target_contract_changed"
        },
        {
          kind: "project",
          ref: "project://program-manager-mcp",
          reason: "consumes_contract"
        },
        {
          kind: "project",
          ref: "project://phalanx",
          reason: "consumes_contract"
        }
      ],
      findings: [
        {
          findingId: "finding-cross-project-hoplon-authz",
          severity: "high",
          type: "cross_project_dependency",
          evidenceRefs: [
            "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          ]
        }
      ],
      evidenceRefs: [
        "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      ],
      artifactRefs: [
        "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      ],
      redactionSummary: {
        redacted: true,
        omittedKinds: ["code_context_body"],
        policyRefs: ["policy://redaction/pointer-only-v1"]
      }
    };
  }
}

export class TrackerAdapterStub extends ReadOnlyProgramAdapter {
  constructor() {
    super(
      {
        adapterId: "tracker-local",
        adapterVersion: "1.0.0",
        authScopes: [
          "portfolio:default:read",
          "tracker:program-manager-mcp:read"
        ],
        capabilityDomains: [
          "tracker_board",
          "task_dependency",
          "task_status"
        ],
        displayName: "LLM Tracker Local Adapter",
        evidenceTypes: [
          "tracker_snapshot",
          "tracker_task_ref"
        ],
        healthModel: {
          circuitOpenAfterFailures: 4,
          circuitOpenSeconds: 1800,
          statuses: [
            "circuit_open",
            "degraded",
            "stale",
            "healthy",
            "unavailable"
          ]
        },
        maxStaleCursorSeconds: 300,
        methods: {
          assessImpact: true,
          describeCapabilities: true,
          getHealth: true,
          getObservationSchema: true,
          getSourceCursor: true,
          produceEvidenceRefs: true,
          readState: true,
          reconcileState: false
        },
        phase1aEnabled: true,
        redactionPolicyRefs: [
          "policy://redaction/pointer-only-v1"
        ],
        sideEffectPosture: "read_only",
        supportedProjects: [
          "project://program-manager-mcp"
        ]
      },
      {
        cursor: "rev:12",
        sourceRevisionHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        observedAt: "2026-05-03T12:00:00Z"
      },
      [
        {
          kind: "tracker_task",
          ref: "tracker://program-manager-mcp/PMO-001",
          reason: "evidence freshness check for C0",
          status: "stale",
          evidenceRefs: [
            "tracker://program-manager-mcp/PMO-001"
          ],
          artifactRefs: [],
          summary: "Tracker task currently flagged for stale evidence."
        },
        {
          kind: "project",
          ref: "project://program-manager-mcp",
          reason: "tracker-synced project identity",
          status: "active",
          evidenceRefs: [
            "artifact://pmo/alignment-report/2026-05-03@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          ]
        },
        {
          kind: "tracker_task",
          ref: "tracker://program-manager-mcp/PMO-002",
          reason: "recently observed follow-up task",
          status: "active",
          evidenceRefs: [
            "tracker://program-manager-mcp/PMO-002"
          ]
        }
      ]
    );
  }

  protected override async getImpactsForTargets(request: AdapterImpactRequest): Promise<Omit<AdapterImpactResult, "requestId">> {
    const targetSet = new Set(request.targetRefs);
    const hasStaleTask = targetSet.has("tracker://program-manager-mcp/PMO-001");

    if (!hasStaleTask) {
      return {
        adapterId: "tracker-local",
        status: "ok",
        sourceCursor: "rev:12",
        affectedRefs: [],
        findings: [],
        evidenceRefs: [],
        artifactRefs: [],
        redactionSummary: {
          redacted: true,
          omittedKinds: ["task_comment_body"],
          policyRefs: ["policy://redaction/pointer-only-v1"]
        }
      };
    }

    return {
      adapterId: "tracker-local",
      status: "warning",
      sourceCursor: "rev:12",
      affectedRefs: [
        {
          kind: "tracker_task",
          ref: "tracker://program-manager-mcp/PMO-001",
          reason: "stale_evidence_candidate"
        }
      ],
      findings: [
        {
          findingId: "finding-stale-tracker-evidence",
          severity: "high",
          type: "stale_evidence",
          evidenceRefs: [
            "tracker://program-manager-mcp/PMO-001"
          ]
        }
      ],
      evidenceRefs: [
        "tracker://program-manager-mcp/PMO-001"
      ],
      artifactRefs: [],
      redactionSummary: {
        redacted: true,
        omittedKinds: ["task_comment_body"],
        policyRefs: ["policy://redaction/pointer-only-v1"]
      }
    };
  }
}

function buildRegistryAdapters() {
  return [new HoplonAdapterStub(), new TrackerAdapterStub()];
}

function normalizeHealthStatusForManifest(
  manifest: AdapterManifest,
  status: AdapterHealthStatus
): AdapterHealthStatus {
  const allowed = new Set(manifest.healthModel.statuses);
  if (allowed.has(status)) {
    return status;
  }
  if (status === "unavailable" && allowed.has("unavailable")) {
    return "unavailable";
  }
  if (status === "stale" && allowed.has("stale")) {
    return "stale";
  }
  if (status === "degraded" && allowed.has("degraded")) {
    return "degraded";
  }
  return allowed.has("unavailable") ? "unavailable" : "degraded";
}

export class AdapterRegistry {
  #adapters = new Map<string, ProgramAdapter>();
  #readStateCircuit: Map<string, AdapterReadCircuitState> = new Map();

  constructor(adapters: ProgramAdapter[] = buildRegistryAdapters()) {
    for (const adapter of adapters) {
      this.#adapters.set(adapter.manifest.adapterId, adapter);
    }
  }

  getAdapterIds(): string[] {
    return [...this.#adapters.keys()].sort();
  }

  getAdapter(adapterId: string): ProgramAdapter | undefined {
    return this.#adapters.get(adapterId);
  }

  listManifests(): AdapterManifest[] {
    return [...this.#adapters.values()].map((adapter) => adapter.manifest).sort((left, right) =>
      left.adapterId.localeCompare(right.adapterId)
    );
  }

  async listCapabilities(capabilityDomain?: string): Promise<ProgramCapabilityListing[]> {
    const manifests = this.listManifests();
    const domains = [...new Set(manifests.flatMap((item) => item.capabilityDomains))].sort();
    const evidencePolicyRefs = sortedUnique(
      [
        "policy://active-adapters/hoplon-authz-tier1",
        "policy://evidence/tracker-snapshot-fast-expiry"
      ]
    );
    const filteredDomains = capabilityDomain ? domains.filter((value) => value === capabilityDomain) : domains;

    if (capabilityDomain && filteredDomains.length === 0) {
      return [];
    }

    const capabilities: ProgramCapabilityListing[] = [
      {
        capabilityId: "capability://program-manager/impact-analysis",
        phase: "1A",
        status: "available",
        domains: filteredDomains,
        toolNames: ["assess_program_impact", "query_program_context"],
        adapterIds: manifests.map((item) => item.adapterId),
        evidencePolicyRefs,
        sideEffectPosture: "read_only"
      },
      {
        capabilityId: "capability://program-manager/flight-plan-planning",
        phase: "2",
        status: "available",
        domains: filteredDomains,
        toolNames: ["plan_program_action"],
        adapterIds: manifests.map((item) => item.adapterId),
        evidencePolicyRefs,
        sideEffectPosture: "describes_actions_only"
      },
      {
        capabilityId: "capability://program-manager/receipt-ledger",
        phase: "3",
        status: "available",
        domains: filteredDomains,
        toolNames: ["record_program_receipt", "reconcile_program_state"],
        adapterIds: manifests.map((item) => item.adapterId),
        evidencePolicyRefs,
        sideEffectPosture: "pmo_internal_write"
      },
      {
        capabilityId: "capability://program-manager/agentic-os-integration",
        phase: "4",
        status: "available",
        domains: filteredDomains,
        toolNames: ["get_agentic_os_context_packet", "submit_agentic_os_receipt"],
        adapterIds: manifests.map((item) => item.adapterId),
        evidencePolicyRefs,
        sideEffectPosture: "describes_actions_only"
      }
    ];

    return capabilities.sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
  }

  async listAdapterById(adapterId: string): Promise<ProgramAdapter | undefined> {
    return this.getAdapter(adapterId);
  }

  async assertNoMutationAuthority(): Promise<void> {
    for (const adapter of this.#adapters.values()) {
      if (adapter.manifest.methods.reconcileState) {
        throw new Error(`${adapter.manifest.adapterId} must not claim mutate capability in Phase 1A`);
      }
      if (adapter.manifest.methods.getHealth === false || adapter.manifest.methods.readState === false) {
        throw new Error(`${adapter.manifest.adapterId} must expose read/health in Phase 1A`);
      }
    }
  }

  #readStateCircuitState(adapterId: string): AdapterReadCircuitState {
    const state = this.#readStateCircuit.get(adapterId);
    if (state) {
      return state;
    }
    const fresh = {
      failures: 0,
      openUntil: null,
      lastFailureAt: null
    };
    this.#readStateCircuit.set(adapterId, fresh);
    return fresh;
  }

  #clearStaleCircuitState(adapterId: string, now: Date): void {
    const state = this.#readStateCircuit.get(adapterId);
    if (!state) {
      return;
    }
    if (state.openUntil && state.openUntil <= now.valueOf()) {
      state.openUntil = null;
      state.failures = 0;
      state.lastFailureAt = null;
    }
  }

  #registerReadFailure(adapterId: string, now: Date, manifest: AdapterManifest): void {
    const state = this.#readStateCircuitState(adapterId);
    state.failures += 1;
    state.lastFailureAt = now.valueOf();

    if (
      manifest.healthModel.circuitOpenAfterFailures > 0 &&
      state.failures >= manifest.healthModel.circuitOpenAfterFailures
    ) {
      state.openUntil = now.valueOf() + manifest.healthModel.circuitOpenSeconds * 1000;
    }
  }

  #resetReadState(adapterId: string): void {
    const state = this.#readStateCircuit.get(adapterId);
    if (!state) {
      return;
    }
    state.failures = 0;
    state.openUntil = null;
    state.lastFailureAt = null;
  }

  #isReadCircuitOpen(adapterId: string, now: Date, manifest: AdapterManifest): AdapterHealthStatus | null {
    const state = this.#readStateCircuitState(adapterId);
    if (!state.openUntil || manifest.healthModel.circuitOpenAfterFailures <= 0) {
      return null;
    }
    if (state.openUntil <= now.valueOf()) {
      state.openUntil = null;
      return null;
    }

    return normalizeHealthStatusForManifest(manifest, "circuit_open");
  }

  #deriveHealth(
    adapter: ProgramAdapter,
    health: AdapterHealthResult,
    now: Date
  ): AdapterHealthResult {
    const manifest = adapter.manifest;
    const state = this.#readStateCircuitState(adapter.manifest.adapterId);
    this.#clearStaleCircuitState(adapter.manifest.adapterId, now);

    const circuitStatus = this.#isReadCircuitOpen(adapter.manifest.adapterId, now, manifest);
    if (circuitStatus) {
      return {
        ...health,
        status: circuitStatus,
        reasons: [
          ...health.reasons,
          `circuit open for ${manifest.healthModel.circuitOpenSeconds}s after ${state.failures} read failures`
        ],
        checkedAt: now.toISOString()
      };
    }

    if (state.failures > 0 && health.status === "healthy" && state.failures < manifest.healthModel.circuitOpenAfterFailures) {
      return {
        ...health,
        status: "degraded",
        reasons: [
          ...health.reasons,
          `${state.failures} read failure${state.failures === 1 ? "" : "s"} in recent window`
        ],
        checkedAt: now.toISOString()
      };
    }

    return {
      ...health,
      status: normalizeHealthStatusForManifest(manifest, health.status),
      checkedAt: now.toISOString()
    };
  }

  async #withReadProtectedAdapter<T>(
    adapterId: string,
    now: string | undefined,
    operation: () => Promise<T>
  ): Promise<T> {
    const adapter = await this.withAdapter(adapterId, (found) => Promise.resolve(found));
    const manifest = adapter.manifest;
    const nowDate = nowOrFallback(now);
    this.#clearStaleCircuitState(adapterId, nowDate);
    const circuitStatus = this.#isReadCircuitOpen(adapterId, nowDate, manifest);
    if (circuitStatus) {
      throw new Error(`Adapter ${adapterId} read path is circuit-open`);
    }

    try {
      const result = await operation();
      this.#resetReadState(adapterId);
      return result;
    } catch (error) {
      this.#registerReadFailure(adapterId, nowDate, manifest);
      throw error;
    }
  }

  async withAdapter<T>(
    adapterId: string,
    callback: (adapter: ProgramAdapter) => Promise<T> | T
  ): Promise<T> {
    const adapter = this.getAdapter(adapterId);
    if (!adapter) {
      throw new Error(`Unknown adapter ${adapterId}`);
    }
    return callback(adapter);
  }

  async readState(adapterId: string, request: AdapterReadStateRequest, now?: string): Promise<AdapterReadStateResult> {
    return this.#withReadProtectedAdapter(adapterId, now, async () => {
      return this.withAdapter(adapterId, (adapter) => adapter.readState(request));
    });
  }

  async assessImpact(
    adapterId: string,
    request: AdapterImpactRequest,
    now?: string
  ): Promise<AdapterImpactResult> {
    return this.#withReadProtectedAdapter(adapterId, now, async () => {
      return this.withAdapter(adapterId, (adapter) => adapter.assessImpact(request));
    });
  }

  async getHealth(adapterId: string, scope: AdapterScope, now?: string): Promise<AdapterHealthResult> {
    const adapter = await this.withAdapter(adapterId, (found) => Promise.resolve(found));
    const nowDate = nowOrFallback(now);
    const health = await adapter.getHealth(scope, now);
    this.#clearStaleCircuitState(adapterId, nowDate);
    return this.#deriveHealth(adapter, health, nowDate);
  }

  async getSourceCursor(adapterId: string, scope: AdapterScope, now?: string): Promise<AdapterCursor> {
    return this.withAdapter(adapterId, (adapter) => adapter.getSourceCursor(scope, now));
  }
}

export const adapterRegistry = new AdapterRegistry();
