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

const intelligenceRecordBaseSchema = z
  .object({
    appliesToRefs: sortedStringArraySchema("intelligenceRecord appliesToRefs"),
    conditionTags: z.array(z.string().min(1)).superRefine((values, ctx) => {
      try {
        enforceSorted(values, (left, right) => left.localeCompare(right), "conditionTags must be sorted");
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : "conditionTags must be sorted"
        });
      }
    }),
    evidenceRefs: sortedStringArraySchema("intelligenceRecord evidenceRefs"),
    portfolioId: pointerRefSchema,
    programId: pointerRefSchema.optional(),
    projectId: pointerRefSchema.optional(),
    recordedAt: isoDateTimeSchema,
    recordId: pointerRefSchema,
    reviewStatus: z.enum(["supported", "needs_review"]),
    sourceAdapterId: z.string().min(1),
    sourceCursor: z.string().min(1),
    sourceRefs: sortedStringArraySchema("intelligenceRecord sourceRefs"),
    summary: z.string().min(1),
    title: z.string().min(1),
    validFrom: isoDateTimeSchema,
    validTo: isoDateTimeSchema.optional()
  })
  .strict();

const learningConfidenceSchema = z
  .object({
    mode: z.enum(["supported", "needs_review"]),
    rationale: z.string().min(1),
    score: z.number().min(0).max(1)
  })
  .strict();

export const learningRecordSchema = intelligenceRecordBaseSchema
  .extend({
    confidence: learningConfidenceSchema,
    recordType: z.literal("learning"),
    reusableLesson: z.string().min(1)
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.reviewStatus === "needs_review" && value.confidence.score > 0.5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "needs_review learning records must have confidence <= 0.5"
      });
    }
    if (value.reviewStatus === "supported" && value.evidenceRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "supported learning records require evidenceRefs"
      });
    }
  });

export const attemptRecordSchema = intelligenceRecordBaseSchema
  .extend({
    attemptedAction: z.string().min(1),
    outcome: z.enum(["failed", "partial", "abandoned"]),
    recordType: z.literal("attempt")
  })
  .strict();

export const discardedDecisionSchema = intelligenceRecordBaseSchema
  .extend({
    decisionRef: pointerRefSchema,
    rationale: z.string().min(1),
    recordType: z.literal("discarded_decision"),
    supersededBy: pointerRefSchema.optional()
  })
  .strict();

export const failurePatternSchema = intelligenceRecordBaseSchema
  .extend({
    occurrenceRefs: sortedStringArraySchema("failurePattern occurrenceRefs"),
    patternKey: z.string().min(1),
    recordType: z.literal("failure_pattern")
  })
  .strict();

export const riskSignalSchema = intelligenceRecordBaseSchema
  .extend({
    recordType: z.literal("risk_signal"),
    riskType: z.string().min(1),
    severity: z.enum(["low", "medium", "high", "critical"])
  })
  .strict();

export const programIntelligenceRecordSchema = z
  .discriminatedUnion("recordType", [
    learningRecordSchema,
    attemptRecordSchema,
    discardedDecisionSchema,
    failurePatternSchema,
    riskSignalSchema
  ])
  .superRefine((value, ctx) => {
    if (value.evidenceRefs.length === 0 && value.reviewStatus !== "needs_review") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "intelligence records require evidenceRefs unless marked needs_review"
      });
    }
  });

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

const contextPaneItemSchema = z
  .object({
    evidenceRefs: sortedStringArraySchema("contextPaneItem evidenceRefs"),
    inclusionReason: z.string().min(1),
    kind: z.string().min(1),
    recordedAt: isoDateTimeSchema,
    ref: pointerRefSchema,
    status: z.string().min(1),
    summary: z.string().min(1)
  })
  .strict();

const recommendedActionSchema = z
  .object({
    actionId: pointerRefSchema,
    actionType: z.string().min(1),
    evidenceRefs: sortedStringArraySchema("recommendedAction evidenceRefs"),
    inclusionReason: z.string().min(1),
    summary: z.string().min(1),
    targetRefs: sortedStringArraySchema("recommendedAction targetRefs")
  })
  .strict();

export const queryProgramContextCoreSchema = z
  .object({
    contextAnchor: programContextAnchorSchema,
    contextPanes: z
      .object({
        applicableDecisions: z.array(contextPaneItemSchema),
        blockingDependencies: z.array(contextPaneItemSchema),
        currentState: z.array(contextPaneItemSchema),
        discardedDecisions: z.array(contextPaneItemSchema),
        futureDecisions: z.array(contextPaneItemSchema),
        recommendedActions: z.array(recommendedActionSchema),
        staleEvidence: z.array(contextPaneItemSchema),
        supersededDecisions: z.array(contextPaneItemSchema)
      })
      .strict()
      .optional(),
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

const generateProgramUpdateSectionSchema = z
  .object({
    sectionId: z.string().min(1),
    summary: z.string().min(1),
    title: z.string().min(1),
    refs: sortedStringArraySchema("generateProgramUpdateSection refs")
  })
  .strict();

const generateProgramUpdateEvidenceEnvelopeSchema = z
  .object({
    artifactRefs: sortedStringArraySchema("generateProgramUpdateEvidenceEnvelope artifactRefs"),
    evidenceRefs: sortedStringArraySchema("generateProgramUpdateEvidenceEnvelope evidenceRefs"),
    generatedAt: isoDateTimeSchema,
    inputRefs: sortedStringArraySchema("generateProgramUpdateEvidenceEnvelope inputRefs"),
    sectionRefs: sortedStringArraySchema("generateProgramUpdateEvidenceEnvelope sectionRefs"),
    stateVersionHash: sha256DigestSchema,
    templateVersion: z.string().min(1)
  })
  .strict();

export const generateProgramUpdateRequestSchema = programToolRequestContextSchema
  .extend({
    maxSections: z.number().int().positive().optional(),
    reportAudience: z.enum(["execution", "governance", "leadership"]).optional(),
    templateVersion: z.string().min(1).optional()
  })
  .strict();

export const generateProgramUpdateCoreSchema = z
  .object({
    evidenceEnvelope: generateProgramUpdateEvidenceEnvelopeSchema,
    evidenceEnvelopeRef: pointerRefSchema,
    inputRefs: sortedStringArraySchema("generateProgramUpdate inputRefs"),
    reportAudience: z.enum(["execution", "governance", "leadership"]),
    reportMarkdownRef: pointerRefSchema,
    sectionRefs: sortedStringArraySchema("generateProgramUpdate sectionRefs"),
    sections: z.array(generateProgramUpdateSectionSchema),
    templateVersion: z.string().min(1)
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      enforceSorted(
        value.sections,
        (left, right) => left.sectionId.localeCompare(right.sectionId),
        "sections must be sorted by sectionId"
      );
      const sortedSectionRefs = [...value.sectionRefs].sort((left, right) =>
        left.localeCompare(right)
      );
      if (!value.sectionRefs.every((sectionRef, index) => sectionRef === sortedSectionRefs[index])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "sectionRefs must be lexicographically sorted"
        });
      }
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "generate_program_update core validation failed"
      });
    }
  });

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

export const generateProgramUpdateResultSchema = programToolResultEnvelopeSchema(
  generateProgramUpdateCoreSchema,
  z.object({ summary: z.string().min(1) }).strict()
);

const flightPlanRuleVersionSchema = z
  .object({
    ruleId: pointerRefSchema,
    version: z.string().min(1)
  })
  .strict();

const flightPlanProposedChangeSchema = z
  .object({
    changeType: z.string().min(1),
    payloadDigest: sha256DigestSchema.optional(),
    payloadSchemaRef: pointerRefSchema.optional(),
    summary: z.string().min(1),
    targetRefs: sortedStringArraySchema("flightPlan proposedChange targetRefs")
  })
  .strict();

const flightPlanPropagationEdgeSchema = z
  .object({
    actionType: z.string().min(1),
    adapterId: z.string().min(1),
    targetRef: pointerRefSchema
  })
  .strict();

const requestedExternalActionSchema = z
  .object({
    actionType: z.string().min(1),
    adapterId: z.string().min(1),
    rationale: z.string().min(1).optional(),
    targetRef: pointerRefSchema
  })
  .strict();

export const planProgramActionRequestSchema = programToolRequestContextSchema
  .extend({
    includeAdvisoryPane: z.boolean().optional(),
    maxPropagationDepth: z.number().int().nonnegative().optional(),
    planTtlSeconds: z.number().int().positive().optional(),
    proposedChange: flightPlanProposedChangeSchema,
    propagationDepth: z.number().int().nonnegative().optional(),
    propagationPath: z.array(flightPlanPropagationEdgeSchema).optional(),
    requestedExternalActions: z.array(requestedExternalActionSchema).optional(),
    traversalBudgetRef: pointerRefSchema
  })
  .strict();

const flightPlanApprovalObligationSchema = z
  .object({
    authorityRef: pointerRefSchema,
    blocking: z.boolean(),
    evidencePolicyRefs: sortedStringArraySchema("flightPlan approval evidencePolicyRefs"),
    reason: z.string().min(1),
    status: z.enum(["satisfied", "unsatisfied"])
  })
  .strict();

const flightPlanEvidenceObligationSchema = z
  .object({
    blocking: z.boolean(),
    policyRef: pointerRefSchema,
    requiredVerifier: z.enum([
      "adapter_observed_state",
      "content_digest",
      "operator_attestation"
    ]),
    status: z.enum(["satisfied", "missing", "stale"]),
    targetRef: pointerRefSchema
  })
  .strict();

const flightPlanRiskFindingSchema = z
  .object({
    evidenceRefs: sortedStringArraySchema("flightPlan risk evidenceRefs"),
    findingId: pointerRefSchema,
    severity: z.enum(["low", "medium", "high", "critical"]),
    summary: z.string().min(1),
    type: z.string().min(1)
  })
  .strict();

const expectedReceiptSchema = z
  .object({
    correlationId: z.string().min(1),
    evidencePolicyRefs: sortedStringArraySchema("expectedReceipt evidencePolicyRefs"),
    expectedReceiptType: z.string().min(1),
    flightPlanHash: sha256DigestSchema,
    flightPlanId: pointerRefSchema,
    flightPlanStateVersionHash: sha256DigestSchema,
    idempotencyKey: sha256DigestSchema,
    proposedActionId: pointerRefSchema,
    receiptRequirementId: pointerRefSchema,
    requiredEvidenceRefs: sortedStringArraySchema("expectedReceipt requiredEvidenceRefs"),
    requiredVerifier: z.enum([
      "adapter_observed_state",
      "content_digest",
      "operator_attestation"
    ]),
    scopeRefs: sortedStringArraySchema("expectedReceipt scopeRefs"),
    status: z.literal("expected"),
    traceId: z.string().min(1)
  })
  .strict();

const proposedExternalActionSchema = z
  .object({
    actionType: z.string().min(1),
    approvalAuthorityRefs: sortedStringArraySchema("proposedExternalAction approvalAuthorityRefs"),
    causation: z
      .object({
        depth: z.number().int().nonnegative(),
        path: z.array(flightPlanPropagationEdgeSchema),
        sourceTool: z.literal("plan_program_action")
      })
      .strict(),
    evidencePolicyRefs: sortedStringArraySchema("proposedExternalAction evidencePolicyRefs"),
    expectedReceiptRequirementIds: sortedStringArraySchema(
      "proposedExternalAction expectedReceiptRequirementIds"
    ),
    idempotencyKey: sha256DigestSchema,
    proposedActionId: pointerRefSchema,
    rationale: z.string().min(1),
    status: z.enum(["proposed", "suppressed"]),
    targetAdapterId: z.string().min(1),
    targetRef: pointerRefSchema
  })
  .strict();

const suppressedProposalSchema = z
  .object({
    actionType: z.string().min(1),
    evidenceRefs: sortedStringArraySchema("suppressedProposal evidenceRefs"),
    reason: z.enum(["duplicate_propagation_edge", "max_propagation_depth_reached"]),
    suppressionId: pointerRefSchema,
    targetAdapterId: z.string().min(1),
    targetRef: pointerRefSchema
  })
  .strict();

export const planProgramActionCoreSchema = z
  .object({
    adapterManifestVersions: z.array(
      z
        .object({
          adapterId: z.string().min(1),
          adapterVersion: z.string().min(1),
          sideEffectPosture: z.enum([
            "read_only",
            "describes_actions_only",
            "mutation_capable_not_exposed"
          ])
        })
        .strict()
    ),
    affectedRefs: z.array(affectedRefSchema),
    approvalObligations: z.array(flightPlanApprovalObligationSchema),
    contextAnchor: programContextAnchorSchema,
    evidenceObligations: z.array(flightPlanEvidenceObligationSchema),
    expectedReceipts: z.array(expectedReceiptSchema),
    expiresAt: isoDateTimeSchema,
    flightPlanHash: sha256DigestSchema,
    flightPlanId: pointerRefSchema,
    flightPlanStateVersionHash: sha256DigestSchema,
    plannerRuleVersions: z.array(flightPlanRuleVersionSchema),
    proposedChange: flightPlanProposedChangeSchema,
    proposedExternalActions: z.array(proposedExternalActionSchema),
    revalidation: z
      .object({
        requiredBeforeReceiptSatisfaction: z.boolean(),
        staleIfAnyChangeTo: z.array(
          z.enum([
            "stateVersionHash",
            "contextAnchor",
            "adapterManifestVersions",
            "plannerRuleVersions"
          ])
        )
      })
      .strict(),
    riskFindings: z.array(flightPlanRiskFindingSchema),
    suppressedProposals: z.array(suppressedProposalSchema),
    traversalBudgetRef: pointerRefSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      enforceSorted(
        value.adapterManifestVersions,
        (left, right) => left.adapterId.localeCompare(right.adapterId),
        "adapterManifestVersions must be sorted by adapterId"
      );
      enforceSorted(
        value.affectedRefs,
        (left, right) => left.kind.localeCompare(right.kind) || left.ref.localeCompare(right.ref),
        "affectedRefs must be sorted by kind then ref"
      );
      enforceSorted(
        value.plannerRuleVersions,
        (left, right) => left.ruleId.localeCompare(right.ruleId),
        "plannerRuleVersions must be sorted by ruleId"
      );
      enforceSorted(
        value.proposedExternalActions,
        (left, right) => left.proposedActionId.localeCompare(right.proposedActionId),
        "proposedExternalActions must be sorted by proposedActionId"
      );
      enforceSorted(
        value.expectedReceipts,
        (left, right) => left.receiptRequirementId.localeCompare(right.receiptRequirementId),
        "expectedReceipts must be sorted by receiptRequirementId"
      );
      enforceSorted(
        value.suppressedProposals,
        (left, right) => left.suppressionId.localeCompare(right.suppressionId),
        "suppressedProposals must be sorted by suppressionId"
      );
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "flight plan ordering validation failed"
      });
    }
  });

export const planProgramActionResultSchema = programToolResultEnvelopeSchema(
  planProgramActionCoreSchema,
  z.object({ summary: z.string().min(1) }).strict()
);

export const getProgramAuditTrailRequestSchema = programToolRequestContextSchema
  .extend({
    eventTypes: z.array(z.string().min(1)).optional(),
    limit: z.number().int().positive().optional(),
    since: isoDateTimeSchema.optional(),
    targetRefs: sortedStringArraySchema("audit targetRefs").optional(),
    until: isoDateTimeSchema.optional()
  })
  .strict();

const auditTrailEntrySchema = z
  .object({
    artifactRefs: sortedStringArraySchema("auditEntry artifactRefs"),
    contextAnchor: programContextAnchorSchema.optional(),
    eventId: pointerRefSchema,
    eventType: z.string().min(1),
    evidenceRefs: sortedStringArraySchema("auditEntry evidenceRefs"),
    inclusionReason: z.string().min(1),
    recordedAt: isoDateTimeSchema
  })
  .strict();

export const getProgramAuditTrailCoreSchema = z
  .object({
    auditEntries: z.array(auditTrailEntrySchema),
    omittedEntryCount: z.number().int().nonnegative()
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      enforceSorted(
        value.auditEntries,
        (left, right) =>
          right.recordedAt.localeCompare(left.recordedAt) ||
          left.eventId.localeCompare(right.eventId),
        "auditEntries must be sorted by recordedAt descending then eventId"
      );
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "audit trail ordering validation failed"
      });
    }
  });

export const getProgramAuditTrailResultSchema = programToolResultEnvelopeSchema(
  getProgramAuditTrailCoreSchema,
  z.object({ summary: z.string().min(1) }).strict()
);

export const analyzeProgramIntelligenceRequestSchema = programToolRequestContextSchema
  .extend({
    conditionTags: z
      .array(z.string().min(1))
      .superRefine((values, ctx) => {
        try {
          enforceSorted(values, (left, right) => left.localeCompare(right), "conditionTags must be sorted");
        } catch (error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: error instanceof Error ? error.message : "conditionTags must be sorted"
          });
        }
      })
      .optional(),
    includeAdvisoryPane: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
    recordTypes: z
      .array(z.enum(["learning", "attempt", "discarded_decision", "failure_pattern", "risk_signal"]))
      .optional(),
    targetRefs: sortedStringArraySchema("intelligence targetRefs")
  })
  .strict();

const intelligenceIssueCardSchema = z
  .object({
    affectedScope: z.array(affectedRefSchema),
    confidence: z
      .object({
        mode: z.enum(["deterministic_rule", "needs_review"]),
        score: z.number().min(0).max(1),
        source: z.enum(["persisted_fact", "fixture_rule", "model_assisted"])
      })
      .strict(),
    evidenceRefs: sortedStringArraySchema("intelligence card evidenceRefs"),
    issueId: pointerRefSchema,
    issueType: z.enum([
      "discarded_decision_match",
      "failure_pattern_match",
      "learning_match",
      "repeated_blocker",
      "risk_signal",
      "stale_evidence"
    ]),
    proposedUpdateStatus: z.enum(["proposed", "not_applicable", "needs_review"]),
    provenance: z
      .object({
        recordIds: sortedStringArraySchema("intelligence provenance recordIds"),
        ruleId: pointerRefSchema,
        ruleVersion: z.string().min(1),
        sourceRecordTypes: z.array(z.string().min(1))
      })
      .strict(),
    recommendedNextAction: z
      .object({
        actionType: z.string().min(1),
        summary: z.string().min(1),
        targetRefs: sortedStringArraySchema("intelligence recommended action targetRefs")
      })
      .strict(),
    relevance: z
      .object({
        rationale: z.string().min(1),
        score: z.number().min(0).max(1)
      })
      .strict(),
    ruleId: pointerRefSchema,
    ruleVersion: z.string().min(1),
    sourceRefs: sortedStringArraySchema("intelligence card sourceRefs"),
    summary: z.string().min(1),
    title: z.string().min(1)
  })
  .strict();

export const analyzeProgramIntelligenceCoreSchema = z
  .object({
    contextAnchor: programContextAnchorSchema,
    issueCards: z.array(intelligenceIssueCardSchema),
    omittedCardCount: z.number().int().nonnegative(),
    rulesVersion: z.string().min(1)
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      enforceSorted(
        value.issueCards,
        (left, right) =>
          left.issueType.localeCompare(right.issueType) ||
          left.issueId.localeCompare(right.issueId),
        "issueCards must be sorted by issueType then issueId"
      );
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "intelligence issue card ordering failed"
      });
    }
  });

export const analyzeProgramIntelligenceResultSchema = programToolResultEnvelopeSchema(
  analyzeProgramIntelligenceCoreSchema,
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
        programIntelligenceRecord: programIntelligenceRecordSchema.optional(),
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
        findings: z.array(findingSchema),
        intelligenceRecords: z
          .array(programIntelligenceRecordSchema)
          .superRefine((values, ctx) => {
            try {
              enforceSorted(
                values,
                (left, right) =>
                  left.recordedAt.localeCompare(right.recordedAt) ||
                  left.recordType.localeCompare(right.recordType) ||
                  left.recordId.localeCompare(right.recordId),
                "I0.intelligenceRecords must be sorted by recordedAt, recordType, and recordId"
              );
            } catch (error) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  error instanceof Error
                    ? error.message
                    : "I0.intelligenceRecords must be sorted deterministically"
              });
            }
          })
          .optional()
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
          .array(z.enum(["circuit_open", "degraded", "stale", "healthy", "unavailable"]))
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
    analyzeProgramIntelligenceCore: analyzeProgramIntelligenceCoreSchema,
    analyzeProgramIntelligenceRequest: analyzeProgramIntelligenceRequestSchema,
    analyzeProgramIntelligenceResult: analyzeProgramIntelligenceResultSchema,
    assessProgramImpactCore: assessProgramImpactCoreSchema,
    assessProgramImpactRequest: assessProgramImpactRequestSchema,
    assessProgramImpactResult: assessProgramImpactResultSchema,
    decisionRecord: decisionRecordSchema,
    discardedDecision: discardedDecisionSchema,
    dependencyRelationship: dependencyRelationshipSchema,
    dependencyRelationshipProps: dependencyRelationshipPropsSchema,
    evidencePolicy: evidencePolicySchema,
    evidenceRef: evidenceRefSchema,
    attemptRecord: attemptRecordSchema,
    failurePattern: failurePatternSchema,
    generateProgramUpdateCore: generateProgramUpdateCoreSchema,
    generateProgramUpdateRequest: generateProgramUpdateRequestSchema,
    generateProgramUpdateResult: generateProgramUpdateResultSchema,
    getProgramAuditTrailCore: getProgramAuditTrailCoreSchema,
    getProgramAuditTrailRequest: getProgramAuditTrailRequestSchema,
    getProgramAuditTrailResult: getProgramAuditTrailResultSchema,
    getProgramDocumentationCore: getProgramDocumentationCoreSchema,
    getProgramDocumentationRequest: getProgramDocumentationRequestSchema,
    getProgramDocumentationResult: getProgramDocumentationResultSchema,
    listProgramCapabilitiesCore: listProgramCapabilitiesCoreSchema,
    listProgramCapabilitiesRequest: listProgramCapabilitiesRequestSchema,
    listProgramCapabilitiesResult: listProgramCapabilitiesResultSchema,
    learningRecord: learningRecordSchema,
    planProgramActionCore: planProgramActionCoreSchema,
    planProgramActionRequest: planProgramActionRequestSchema,
    planProgramActionResult: planProgramActionResultSchema,
    portfolio: portfolioSchema,
    programIntelligenceRecord: programIntelligenceRecordSchema,
    program: programSchema,
    programContextAnchor: programContextAnchorSchema,
    programToolRequestContext: programToolRequestContextSchema,
    project: projectSchema,
    queryProgramContextCore: queryProgramContextCoreSchema,
    queryProgramContextRequest: queryProgramContextRequestSchema,
    queryProgramContextResult: queryProgramContextResultSchema,
    redactionSummary: redactionSummarySchema,
    riskSignal: riskSignalSchema,
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
