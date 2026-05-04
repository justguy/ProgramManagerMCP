import { z } from "zod";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
const sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const pointerRefSchema = z.string().regex(/^[a-z][a-z0-9_-]*:\/\/\S+$/);
const gitCommitSchema = z.string().regex(/^[a-f0-9]{6,64}$/i);

const prohibitedInlineKinds = [
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

const severityRank = new Map([
  ["critical", 0],
  ["high", 1],
  ["medium", 2],
  ["low", 3]
]);

function enforceSorted<T>(
  values: T[],
  compare: (left: T, right: T) => number,
  message: string
): void {
  for (let index = 1; index < values.length; index += 1) {
    if (compare(values[index - 1], values[index]) > 0) {
      throw new Error(`${message} at index ${index - 1}`);
    }
  }
}

function sortedStringArraySchema(label: string) {
  return z.array(pointerRefSchema).superRefine((values, ctx) => {
    try {
      enforceSorted(values, (left, right) => left.localeCompare(right), `${label} must be sorted`);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : `${label} must be sorted`
      });
    }
  });
}

export const contentHashSchema = z
  .object({
    algorithm: z.literal("sha256"),
    value: sha256HexSchema
  })
  .strict();

export const portfolioSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    portfolioId: z.literal("portfolio://default").or(pointerRefSchema),
    tenantId: pointerRefSchema
  })
  .strict();

export const programSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    portfolioId: pointerRefSchema,
    programId: pointerRefSchema
  })
  .strict();

export const projectSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    portfolioId: pointerRefSchema.optional(),
    programIds: sortedStringArraySchema("programIds").optional(),
    projectId: pointerRefSchema,
    repoRefs: sortedStringArraySchema("repoRefs").optional()
  })
  .strict();

export const programContextAnchorSchema = z
  .object({
    asOf: isoDateTimeSchema.optional(),
    branchName: z.string().min(1).optional(),
    gitCommit: gitCommitSchema.optional(),
    hoplonSnapshotRef: pointerRefSchema.optional(),
    portfolioId: pointerRefSchema,
    programId: pointerRefSchema.optional(),
    projectId: pointerRefSchema.optional(),
    repoId: pointerRefSchema.optional(),
    trackerRev: z.number().int().nonnegative().optional(),
    trackerSlug: z.string().min(1).optional()
  })
  .strict();

export const artifactRefSchema = z
  .object({
    artifactId: pointerRefSchema,
    artifactType: z.string().min(1),
    branchName: z.string().min(1).optional(),
    classification: z.enum(["internal", "restricted", "public"]),
    contentHash: contentHashSchema,
    createdAt: isoDateTimeSchema,
    gitCommit: gitCommitSchema.optional(),
    portfolioId: pointerRefSchema,
    producer: z.string().min(1),
    programId: pointerRefSchema.optional(),
    projectId: pointerRefSchema.optional(),
    redactionStatus: z.enum(["not_required", "redacted", "pending_review", "blocked"]),
    repoId: pointerRefSchema.optional(),
    retentionPolicyRef: pointerRefSchema,
    storageUri: pointerRefSchema,
    validFrom: isoDateTimeSchema
  })
  .strict();

export const evidenceRefSchema = z
  .object({
    artifactRef: pointerRefSchema.optional(),
    classification: z.enum(["internal", "restricted", "public"]),
    contentHash: contentHashSchema,
    evidenceRef: pointerRefSchema,
    evidenceType: z.string().min(1),
    portfolioId: pointerRefSchema,
    redactionStatus: z.enum(["not_required", "redacted", "pending_review", "blocked"]),
    verificationMethod: z.enum([
      "adapter_observed_state",
      "content_digest",
      "operator_attestation"
    ])
  })
  .strict();

export const evidencePolicySchema = z
  .object({
    allowedVerificationMethods: z
      .array(
        z.enum(["adapter_observed_state", "content_digest", "operator_attestation"])
      )
      .min(1),
    appliesToCriticality: z.array(z.enum(["tier_0", "tier_1", "tier_2", "tier_3"])).min(1),
    artifactTypes: z.array(z.string().min(1)).min(1),
    branchSpecific: z.boolean(),
    commitSpecific: z.boolean(),
    digestRequired: z.boolean(),
    maxAgeSeconds: z.number().int().positive(),
    policyId: pointerRefSchema,
    reviewerAuthorityRefs: sortedStringArraySchema("reviewerAuthorityRefs"),
    signatureRequired: z.boolean()
  })
  .strict();

export const decisionRecordSchema = z
  .object({
    actorId: pointerRefSchema,
    appliesToRefs: sortedStringArraySchema("appliesToRefs"),
    authorityRef: pointerRefSchema,
    decisionId: pointerRefSchema,
    decisionType: z.string().min(1),
    evidenceRefs: sortedStringArraySchema("decision evidenceRefs"),
    portfolioId: pointerRefSchema,
    programId: pointerRefSchema.optional(),
    projectId: pointerRefSchema.optional(),
    recordedAt: isoDateTimeSchema,
    status: z.enum(["active", "superseded", "discarded", "future_not_applicable"]),
    validFrom: isoDateTimeSchema,
    validTo: isoDateTimeSchema.optional()
  })
  .strict();

export const syncCursorSchema = z
  .object({
    adapterId: z.string().min(1),
    cursor: z.string().min(1),
    observedAt: isoDateTimeSchema,
    portfolioId: pointerRefSchema,
    sourceRevisionHash: sha256DigestSchema,
    status: z.enum(["current", "stale", "unavailable"])
  })
  .strict();

export const dependencyRelationshipPropsSchema = z
  .object({
    approvalRequired: z.boolean().optional(),
    contractRef: pointerRefSchema.optional(),
    criticality: z.enum(["tier_0", "tier_1", "tier_2", "tier_3"]),
    dependencyId: z.string().min(1),
    dependencyType: z.string().min(1),
    evidenceRefs: sortedStringArraySchema("dependency evidenceRefs").optional(),
    integrationPointId: pointerRefSchema.optional(),
    policyRefs: sortedStringArraySchema("dependency policyRefs"),
    portfolioId: pointerRefSchema,
    programId: pointerRefSchema.optional(),
    projectId: pointerRefSchema.optional(),
    receiptRequirements: sortedStringArraySchema("receiptRequirements").optional(),
    recordedAt: isoDateTimeSchema,
    sourceAdapterId: z.string().min(1).optional(),
    sourceCursor: z.string().min(1).optional(),
    status: z.enum([
      "active",
      "pending",
      "satisfied",
      "blocked",
      "stale",
      "superseded",
      "discarded"
    ]),
    validFrom: isoDateTimeSchema,
    validTo: isoDateTimeSchema.optional(),
    verificationRequired: z.boolean().optional()
  })
  .strict();

export const dependencyRelationshipSchema = z
  .object({
    criticality: z.enum(["tier_0", "tier_1", "tier_2", "tier_3"]),
    dependencyId: z.string().min(1),
    dependencyType: z.string().min(1),
    fromRef: pointerRefSchema,
    policyRefs: sortedStringArraySchema("dependency policyRefs"),
    status: z.enum([
      "active",
      "pending",
      "satisfied",
      "blocked",
      "stale",
      "superseded",
      "discarded"
    ]),
    toRef: pointerRefSchema
  })
  .strict();

export const affectedRefSchema = z
  .object({
    kind: z.string().min(1),
    reason: z.string().min(1).optional(),
    ref: pointerRefSchema
  })
  .strict();

export const findingSchema = z
  .object({
    evidenceRefs: sortedStringArraySchema("finding evidenceRefs"),
    findingId: z.string().min(1),
    severity: z.enum(["low", "medium", "high", "critical"]),
    summary: z.string().min(1).optional(),
    type: z.string().min(1)
  })
  .strict();

export const warningSchema = z
  .object({
    evidenceRefs: sortedStringArraySchema("warning evidenceRefs"),
    severity: z.enum(["low", "medium", "high", "critical"]),
    summary: z.string().min(1),
    warningId: z.string().min(1)
  })
  .strict();

export const redactionSummarySchema = z
  .object({
    omittedKinds: z.array(z.string().min(1)),
    policyRefs: sortedStringArraySchema("redactionSummary policyRefs"),
    redacted: z.boolean()
  })
  .strict();

export const programToolRequestContextSchema = z
  .object({
    contextAnchor: programContextAnchorSchema.optional(),
    correlationId: z.string().min(1),
    portfolioId: pointerRefSchema,
    programId: pointerRefSchema.optional(),
    projectIds: sortedStringArraySchema("projectIds").optional(),
    traceId: z.string().min(1)
  })
  .strict();

export const advisoryPaneSchema = <T extends z.ZodTypeAny>(contentSchema: T) =>
  z
    .object({
      content: contentSchema,
      excludedFromDeterministicHash: z.literal(true),
      modelAssisted: z.boolean()
    })
    .strict();

export const programToolResultEnvelopeSchema = <
  TCore extends z.ZodTypeAny,
  TAdvisory extends z.ZodTypeAny
>(
  coreSchema: TCore,
  advisorySchema: TAdvisory
) =>
  z
    .object({
      advisoryPane: advisoryPaneSchema(advisorySchema).optional(),
      artifactRefs: sortedStringArraySchema("artifactRefs"),
      correlationId: z.string().min(1),
      deterministicCore: coreSchema.optional(),
      evidenceRefs: sortedStringArraySchema("evidenceRefs"),
      nextRecommendedTool: z.string().min(1).optional(),
      portfolioId: pointerRefSchema.optional(),
      programId: pointerRefSchema.optional(),
      projectIds: sortedStringArraySchema("projectIds").optional(),
      redactionSummary: redactionSummarySchema,
      schemaVersion: z.literal("1"),
      stateVersionHash: sha256DigestSchema.optional(),
      status: z.enum(["ok", "warning", "blocked", "error", "degraded"]),
      toolName: z.string().min(1),
      traceId: z.string().min(1),
      warnings: z.array(warningSchema)
    })
    .strict()
    .superRefine((value, ctx) => {
      try {
        enforceSorted(
          value.warnings,
          (left, right) =>
            (severityRank.get(left.severity) ?? Number.MAX_SAFE_INTEGER) -
              (severityRank.get(right.severity) ?? Number.MAX_SAFE_INTEGER) ||
            left.warningId.localeCompare(right.warningId),
          "warnings must be sorted by severity then warningId"
        );
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            error instanceof Error
              ? error.message
              : "warnings must be sorted by severity then warningId"
        });
      }
    });

export const listProgramCapabilitiesRequestSchema = programToolRequestContextSchema
  .extend({
    capabilityDomain: z.string().min(1).optional(),
    includeAdapters: z.boolean().optional()
  })
  .strict();

export const listProgramCapabilitiesCoreSchema = z
  .object({
    capabilities: z
      .array(
        z
          .object({
            adapterIds: z.array(z.string().min(1)),
            capabilityId: pointerRefSchema,
            domains: z.array(z.string().min(1)),
            evidencePolicyRefs: sortedStringArraySchema("capability evidencePolicyRefs"),
            phase: z.enum(["1A", "1B", "1C", "2", "3"]),
            sideEffectPosture: z.enum([
              "read_only",
              "pmo_internal_write",
              "describes_actions_only"
            ]),
            status: z.enum(["available", "planned", "disabled", "degraded"]),
            toolNames: z.array(z.string().min(1))
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export const getProgramDocumentationRequestSchema = programToolRequestContextSchema
  .extend({
    format: z.enum(["markdown", "json_summary"]).optional(),
    topic: z.enum([
      "overview",
      "schemas",
      "tool_contracts",
      "adapter_contracts",
      "evidence_rules",
      "authz_rules",
      "failure_modes",
      "fixture_backbone"
    ])
  })
  .strict();

export const getProgramDocumentationCoreSchema = z
  .object({
    sections: z.array(
      z
        .object({
          artifactRefs: sortedStringArraySchema("documentation artifactRefs"),
          evidenceRefs: sortedStringArraySchema("documentation evidenceRefs"),
          schemaRefs: sortedStringArraySchema("documentation schemaRefs"),
          sectionId: z.string().min(1),
          summary: z.string().min(1),
          title: z.string().min(1)
        })
        .strict()
    ),
    topic: z.string().min(1)
  })
  .strict();

export const queryProgramContextRequestSchema = programToolRequestContextSchema
  .extend({
    includeFutureNotApplicable: z.boolean().optional(),
    includeSuperseded: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
    queryKind: z.enum([
      "applicable_decisions",
      "dependency_status",
      "evidence_status",
      "contract_context",
      "program_summary"
    ]),
    targetRefs: sortedStringArraySchema("targetRefs")
  })
  .strict();

export const queryProgramContextCoreSchema = z
  .object({
    contextAnchor: programContextAnchorSchema,
    matchedRefs: z.array(
      z
        .object({
          evidenceRefs: sortedStringArraySchema("matchedRef evidenceRefs"),
          kind: z.string().min(1),
          reason: z.string().min(1),
          recordedAt: isoDateTimeSchema,
          ref: pointerRefSchema,
          status: z.string().min(1),
          validFrom: isoDateTimeSchema.optional(),
          validTo: isoDateTimeSchema.optional()
        })
        .strict()
    ),
    omittedRefCount: z.number().int().nonnegative()
  })
  .strict();

export const assessProgramImpactRequestSchema = programToolRequestContextSchema
  .extend({
    changeKind: z.string().min(1),
    changeRef: pointerRefSchema,
    targetRefs: sortedStringArraySchema("targetRefs"),
    traversalBudgetRef: pointerRefSchema
  })
  .strict();

export const assessProgramImpactCoreSchema = z
  .object({
    affectedRefs: z.array(affectedRefSchema),
    changeRef: pointerRefSchema,
    evidenceObligations: z.array(
      z
        .object({
          policyRef: pointerRefSchema,
          status: z.enum(["satisfied", "missing", "stale"]),
          targetRef: pointerRefSchema
        })
        .strict()
    ),
    findings: z.array(findingSchema),
    requiredApprovals: z.array(
      z
        .object({
          authorityRef: pointerRefSchema,
          evidencePolicyRefs: sortedStringArraySchema("required approval evidencePolicyRefs"),
          reason: z.string().min(1)
        })
        .strict()
    )
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      enforceSorted(
        value.affectedRefs,
        (left, right) => left.kind.localeCompare(right.kind) || left.ref.localeCompare(right.ref),
        "affectedRefs must be sorted by kind then ref"
      );
      enforceSorted(
        value.findings,
        (left, right) =>
          (severityRank.get(left.severity) ?? Number.MAX_SAFE_INTEGER) -
            (severityRank.get(right.severity) ?? Number.MAX_SAFE_INTEGER) ||
          left.findingId.localeCompare(right.findingId),
        "findings must be sorted by severity then findingId"
      );
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error ? error.message : "deterministic ordering validation failed"
      });
    }
  });

export const listProgramCapabilitiesResultSchema = programToolResultEnvelopeSchema(
  listProgramCapabilitiesCoreSchema,
  z.object({ summary: z.string().min(1) }).strict()
);

export const getProgramDocumentationResultSchema = programToolResultEnvelopeSchema(
  getProgramDocumentationCoreSchema,
  z.object({ summary: z.string().min(1) }).strict()
);

export const queryProgramContextResultSchema = programToolResultEnvelopeSchema(
  queryProgramContextCoreSchema,
  z.object({ summary: z.string().min(1) }).strict()
);

export const assessProgramImpactResultSchema = programToolResultEnvelopeSchema(
  assessProgramImpactCoreSchema,
  z.object({ summary: z.string().min(1) }).strict()
);

export const phase1aToolExamplesSchema = z
  .object({
    assess_program_impact: z
      .object({
        request: assessProgramImpactRequestSchema,
        result: assessProgramImpactResultSchema.safeExtend({
          toolName: z.literal("assess_program_impact")
        })
      })
      .strict(),
    get_program_documentation: z
      .object({
        request: getProgramDocumentationRequestSchema,
        result: getProgramDocumentationResultSchema.safeExtend({
          toolName: z.literal("get_program_documentation")
        })
      })
      .strict(),
    list_program_capabilities: z
      .object({
        request: listProgramCapabilitiesRequestSchema,
        result: listProgramCapabilitiesResultSchema.safeExtend({
          toolName: z.literal("list_program_capabilities")
        })
      })
      .strict(),
    query_program_context: z
      .object({
        request: queryProgramContextRequestSchema,
        result: queryProgramContextResultSchema.safeExtend({
          toolName: z.literal("query_program_context")
        })
      })
      .strict()
  })
  .strict();

export const toolContractsDocumentSchema = z
  .object({
    commonRequestContext: programToolRequestContextSchema,
    laterToolContractScope: z.array(
      z
        .object({
          deterministicCoreIncludes: z.array(z.string().min(1)).min(1),
          phase: z.enum(["1B", "1C", "2", "3"]),
          toolName: z.enum([
            "generate_program_update",
            "get_program_audit_trail",
            "analyze_program_intelligence",
            "plan_program_action",
            "record_program_receipt",
            "reconcile_program_state"
          ])
        })
        .strict()
    ),
    phase1aToolExamples: phase1aToolExamplesSchema,
    schemaVersion: z.literal("1.0.0"),
    validationContract: z
      .object({
        advisoryExcludedFromDeterministicHash: z.literal(true),
        envelopeSchemaVersion: z.literal("1"),
        pointerOnly: z.literal(true),
        prohibitedInlineKinds: z.array(z.enum(prohibitedInlineKinds)).min(1)
      })
      .strict()
  })
  .strict();

export const schemaExamplesDocumentSchema = z
  .object({
    examples: z
      .object({
        artifactRef: artifactRefSchema,
        contextAnchor: programContextAnchorSchema,
        decisionRecord: decisionRecordSchema,
        dependencyRelationshipProps: dependencyRelationshipPropsSchema,
        evidencePolicy: evidencePolicySchema,
        evidenceRef: evidenceRefSchema,
        portfolio: portfolioSchema,
        program: programSchema,
        project: projectSchema,
        syncCursor: syncCursorSchema
      })
      .strict(),
    schemaVersion: z.literal("1.0.0"),
    validationContract: z
      .object({
        deterministicOrdering: z.literal(true),
        externalValidation: z.literal("json_schema_ajv"),
        pointerOnly: z.literal(true),
        prohibitedInlineKinds: z.array(z.enum(prohibitedInlineKinds)).min(1),
        schemaAuthoring: z.literal("zod")
      })
      .strict()
  })
  .strict();

export const goldenFixtureBackboneSchema = z
  .object({
    A0: z
      .object({
        affectedRefs: z.array(affectedRefSchema)
      })
      .strict()
      .superRefine((value, ctx) => {
        try {
          enforceSorted(
            value.affectedRefs,
            (left, right) => left.kind.localeCompare(right.kind) || left.ref.localeCompare(right.ref),
            "A0.affectedRefs must be sorted by kind then ref"
          );
        } catch (error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              error instanceof Error
                ? error.message
                : "A0.affectedRefs must be sorted by kind then ref"
          });
        }
      }),
    C0: z
      .object({
        changeId: pointerRefSchema,
        changeKind: z.string().min(1),
        description: z.string().min(1),
        targetRefs: sortedStringArraySchema("C0.targetRefs")
      })
      .strict(),
    F0: z
      .object({
        findings: z.array(findingSchema)
      })
      .strict(),
    G0: z
      .object({
        contracts: z.array(
          z
            .object({
              contractRef: pointerRefSchema,
              producerProjectId: pointerRefSchema
            })
            .strict()
        ),
        decisionRefs: sortedStringArraySchema("G0.decisionRefs"),
        dependencyRelationships: z.array(dependencyRelationshipSchema),
        description: z.string().min(1),
        evidenceRefs: sortedStringArraySchema("G0.evidenceRefs"),
        integrationPoints: z.array(
          z
            .object({
              consumerProjectIds: sortedStringArraySchema("consumerProjectIds"),
              integrationPointId: pointerRefSchema,
              producerProjectId: pointerRefSchema
            })
            .strict()
        ),
        portfolios: z.array(portfolioSchema),
        programs: z.array(programSchema),
        projects: z.array(projectSchema)
      })
      .strict(),
    H0: z
      .object({
        expectedStateVersionHash: sha256DigestSchema,
        hashInputRef: z.string().min(1)
      })
      .strict(),
    I0: z
      .object({
        description: z.string().min(1),
        findings: z.array(findingSchema)
      })
      .strict(),
    P0: z
      .object({
        description: z.string().min(1),
        fixtureRef: z.string().min(1)
      })
      .strict(),
    R0: z
      .object({
        description: z.string().min(1),
        fixtureRef: z.string().min(1)
      })
      .strict(),
    fixtureSetId: z.string().min(1),
    schemaVersion: z.literal("1.0.0")
  })
  .strict();

export const adapterManifestSchema = z
  .object({
    adapterId: z.string().min(1),
    adapterVersion: z.string().min(1),
    authScopes: z.array(z.string().min(1)).min(1),
    capabilityDomains: z.array(z.string().min(1)).min(1),
    displayName: z.string().min(1),
    evidenceTypes: z.array(z.string().min(1)).min(1),
    healthModel: z
      .object({
        circuitOpenAfterFailures: z.number().int().nonnegative(),
        circuitOpenSeconds: z.number().int().nonnegative(),
        statuses: z
          .array(z.enum(["circuit_open", "degraded", "healthy", "unavailable"]))
          .min(1)
      })
      .strict(),
    maxStaleCursorSeconds: z.number().int().positive(),
    methods: z
      .object({
        assessImpact: z.boolean(),
        describeCapabilities: z.boolean(),
        getHealth: z.boolean(),
        getObservationSchema: z.boolean(),
        getSourceCursor: z.boolean(),
        produceEvidenceRefs: z.boolean(),
        readState: z.boolean(),
        reconcileState: z.boolean()
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.reconcileState) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Phase 1A adapter fixtures must not claim PMO mutation authority"
          });
        }
      }),
    phase1aEnabled: z.boolean(),
    redactionPolicyRefs: sortedStringArraySchema("redactionPolicyRefs"),
    sideEffectPosture: z.enum([
      "read_only",
      "describes_actions_only",
      "mutation_capable_not_exposed"
    ]),
    supportedProjects: sortedStringArraySchema("supportedProjects")
  })
  .strict();

export const adapterImpactResultSchema = z
  .object({
    adapterId: z.string().min(1),
    affectedRefs: z.array(affectedRefSchema),
    artifactRefs: sortedStringArraySchema("adapter artifactRefs"),
    evidenceRefs: sortedStringArraySchema("adapter evidenceRefs"),
    findings: z.array(findingSchema),
    redactionSummary: redactionSummarySchema,
    requestId: z.string().min(1),
    sourceCursor: z.string().min(1),
    status: z.enum(["ok", "warning", "blocked", "error", "degraded"])
  })
  .strict();

export const adapterImpactExampleSchema = z
  .object({
    adapterId: z.string().min(1),
    request: z
      .object({
        changeKind: z.string().min(1),
        changeRef: pointerRefSchema,
        contextAnchor: programContextAnchorSchema,
        portfolioId: pointerRefSchema,
        programId: pointerRefSchema.optional(),
        requestId: z.string().min(1),
        targetRefs: sortedStringArraySchema("adapter targetRefs"),
        traversalBudgetRef: pointerRefSchema
      })
      .strict(),
    result: adapterImpactResultSchema
  })
  .strict();

export const approvalAuthorityExampleSchema = z
  .object({
    actorId: pointerRefSchema,
    allowedContractRefs: sortedStringArraySchema("allowedContractRefs"),
    authorityRef: pointerRefSchema,
    breakGlassAllowed: z.boolean(),
    breakGlassEvidenceRefs: sortedStringArraySchema("breakGlassEvidenceRefs"),
    expiresAt: isoDateTimeSchema,
    maxCriticality: z.enum(["tier_0", "tier_1", "tier_2", "tier_3"]),
    policyRef: pointerRefSchema.optional(),
    portfolioGrants: sortedStringArraySchema("portfolioGrants"),
    programGrants: sortedStringArraySchema("programGrants"),
    requiredEvidencePolicyRefs: sortedStringArraySchema("requiredEvidencePolicyRefs"),
    reviewBy: isoDateTimeSchema,
    role: z.enum(["human_operator", "service_account", "approver_delegate"]),
    validFrom: isoDateTimeSchema
  })
  .strict();

export const adapterContractFixturesDocumentSchema = z
  .object({
    adapterManifests: z.array(adapterManifestSchema).min(1),
    approvalAuthorityExamples: z.array(approvalAuthorityExampleSchema).min(1),
    impactExamples: z.array(adapterImpactExampleSchema).min(1),
    schemaVersion: z.literal("1.0.0")
  })
  .strict();

export const programManagerSchemaBundleSchema = z
  .object({
    artifactRef: artifactRefSchema,
    assessProgramImpactCore: assessProgramImpactCoreSchema,
    assessProgramImpactRequest: assessProgramImpactRequestSchema,
    assessProgramImpactResult: assessProgramImpactResultSchema,
    decisionRecord: decisionRecordSchema,
    dependencyRelationship: dependencyRelationshipSchema,
    dependencyRelationshipProps: dependencyRelationshipPropsSchema,
    evidencePolicy: evidencePolicySchema,
    evidenceRef: evidenceRefSchema,
    getProgramDocumentationCore: getProgramDocumentationCoreSchema,
    getProgramDocumentationRequest: getProgramDocumentationRequestSchema,
    getProgramDocumentationResult: getProgramDocumentationResultSchema,
    listProgramCapabilitiesCore: listProgramCapabilitiesCoreSchema,
    listProgramCapabilitiesRequest: listProgramCapabilitiesRequestSchema,
    listProgramCapabilitiesResult: listProgramCapabilitiesResultSchema,
    portfolio: portfolioSchema,
    program: programSchema,
    programContextAnchor: programContextAnchorSchema,
    programToolRequestContext: programToolRequestContextSchema,
    project: projectSchema,
    queryProgramContextCore: queryProgramContextCoreSchema,
    queryProgramContextRequest: queryProgramContextRequestSchema,
    queryProgramContextResult: queryProgramContextResultSchema,
    redactionSummary: redactionSummarySchema,
    syncCursor: syncCursorSchema
  })
  .strict();

export const programManagerSchemaRegistry = {
  "adapter-contract-fixtures.schema.json": adapterContractFixturesDocumentSchema,
  "golden-fixture-backbone.schema.json": goldenFixtureBackboneSchema,
  "program-manager.schema.json": programManagerSchemaBundleSchema,
  "schema-examples.schema.json": schemaExamplesDocumentSchema,
  "tool-contracts.schema.json": toolContractsDocumentSchema
} as const;

export type ProgramManagerSchemaFile = keyof typeof programManagerSchemaRegistry;
