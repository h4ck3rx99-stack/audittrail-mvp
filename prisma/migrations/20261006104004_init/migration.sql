-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "EmployeeRange" AS ENUM ('R1_10', 'R11_50', 'R51_200', 'R201_500', 'R501_1000', 'R1000_PLUS');

-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('TYPE_1', 'TYPE_2', 'UNDECIDED');

-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('GROUP', 'REQUIREMENT');

-- CreateEnum
CREATE TYPE "ControlStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReviewFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "ReviewOutcome" AS ENUM ('EFFECTIVE', 'NEEDS_IMPROVEMENT', 'INEFFECTIVE');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('FILE', 'LINK');

-- CreateEnum
CREATE TYPE "EvidenceCategory" AS ENUM ('POLICY', 'SCREENSHOT', 'CONFIGURATION', 'REPORT', 'LOG', 'RECORD', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('MANUAL', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('MANUAL', 'GAP');

-- CreateEnum
CREATE TYPE "RiskKind" AS ENUM ('GAP', 'RISK');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'MITIGATED', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RiskSource" AS ENUM ('MANUAL', 'DETECTED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'CONTROL_ASSIGNED', 'CONTROL_REVIEW_DUE', 'EVIDENCE_SUBMITTED_FOR_REVIEW', 'EVIDENCE_REVIEWED', 'EVIDENCE_EXPIRING', 'EVIDENCE_EXPIRED', 'RISK_ASSIGNED', 'MEMBER_ROLE_CHANGED', 'INVITATION_RECEIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastActiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "employeeRange" "EmployeeRange" NOT NULL DEFAULT 'R1_10',
    "description" TEXT,
    "auditType" "AuditType" NOT NULL DEFAULT 'UNDECIDED',
    "targetAuditDate" DATE,
    "observationStart" DATE,
    "observationEnd" DATE,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "requireIndependentEvidenceReview" BOOLEAN NOT NULL DEFAULT true,
    "defaultEvidenceValidityDays" INTEGER NOT NULL DEFAULT 365,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationCounter" (
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrganizationCounter_pkey" PRIMARY KEY ("organizationId","key")
);

-- CreateTable
CREATE TABLE "Framework" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirementLabel" TEXT NOT NULL,
    "requirementShortLabel" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Framework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameworkRequirement" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "kind" "RequirementKind" NOT NULL,
    "isScopeRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FrameworkRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlTemplate" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "guidance" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "defaultPriority" "Priority" NOT NULL,
    "defaultReviewFrequency" "ReviewFrequency" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ControlTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlTemplateRequirement" (
    "controlTemplateId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,

    CONSTRAINT "ControlTemplateRequirement_pkey" PRIMARY KEY ("controlTemplateId","requirementId")
);

-- CreateTable
CREATE TABLE "EvidenceRequirementTemplate" (
    "id" TEXT NOT NULL,
    "controlTemplateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "freshnessDays" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EvidenceRequirementTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationFramework" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "adoptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adoptedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationFramework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationFrameworkScope" (
    "organizationFrameworkId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationFrameworkScope_pkey" PRIMARY KEY ("organizationFrameworkId","requirementId")
);

-- CreateTable
CREATE TABLE "Control" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "implementationNotes" TEXT,
    "notes" TEXT,
    "domain" TEXT,
    "status" "ControlStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "notApplicableReason" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "ownerId" TEXT,
    "reviewFrequency" "ReviewFrequency" NOT NULL DEFAULT 'ANNUALLY',
    "nextReviewDate" DATE,
    "lastReviewedAt" TIMESTAMPTZ(3),
    "templateId" TEXT,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlRequirement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "ReviewOutcome" NOT NULL,
    "notes" TEXT NOT NULL,
    "nextReviewDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRequirement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "freshnessDays" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "templateId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EvidenceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "EvidenceKind" NOT NULL,
    "category" "EvidenceCategory" NOT NULL,
    "url" TEXT,
    "source" "EvidenceSource" NOT NULL DEFAULT 'MANUAL',
    "status" "EvidenceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "collectedAt" DATE NOT NULL,
    "validUntil" DATE,
    "currentVersionId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewComment" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlEvidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "evidenceRequirementId" TEXT,
    "linkedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "dueDate" DATE,
    "completedAt" TIMESTAMPTZ(3),
    "completedById" TEXT,
    "riskId" TEXT,
    "source" "TaskSource" NOT NULL DEFAULT 'MANUAL',
    "gapKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskControl" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,

    CONSTRAINT "TaskControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "RiskKind" NOT NULL DEFAULT 'RISK',
    "severity" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "dueDate" DATE,
    "treatmentPlan" TEXT,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" TEXT,
    "source" "RiskSource" NOT NULL DEFAULT 'MANUAL',
    "gapKey" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskControl" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,

    CONSTRAINT "RiskControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "chainKey" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "organizationId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceLabel" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditChainHead" (
    "chainKey" TEXT NOT NULL,
    "lastSequence" BIGINT NOT NULL DEFAULT 0,
    "lastHash" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuditChainHead_pkey" PRIMARY KEY ("chainKey")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkPath" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_name_trgm_idx" ON "User" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_email_trgm_idx" ON "User" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_key" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_tokenHash_key" ON "Verification"("tokenHash");

-- CreateIndex
CREATE INDEX "Verification_userId_purpose_idx" ON "Verification"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_role_idx" ON "OrganizationMember"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_email_idx" ON "Invitation"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Framework_key_key" ON "Framework"("key");

-- CreateIndex
CREATE INDEX "FrameworkRequirement_frameworkId_parentId_idx" ON "FrameworkRequirement"("frameworkId", "parentId");

-- CreateIndex
CREATE INDEX "FrameworkRequirement_title_trgm_idx" ON "FrameworkRequirement" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "FrameworkRequirement_frameworkId_code_key" ON "FrameworkRequirement"("frameworkId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ControlTemplate_frameworkId_code_key" ON "ControlTemplate"("frameworkId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRequirementTemplate_controlTemplateId_key_key" ON "EvidenceRequirementTemplate"("controlTemplateId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationFramework_organizationId_frameworkId_key" ON "OrganizationFramework"("organizationId", "frameworkId");

-- CreateIndex
CREATE INDEX "Control_organizationId_status_idx" ON "Control"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Control_organizationId_ownerId_idx" ON "Control"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "Control_organizationId_nextReviewDate_idx" ON "Control"("organizationId", "nextReviewDate");

-- CreateIndex
CREATE INDEX "Control_organizationId_archivedAt_idx" ON "Control"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "Control_code_trgm_idx" ON "Control" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Control_name_trgm_idx" ON "Control" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Control_description_trgm_idx" ON "Control" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Control_organizationId_code_key" ON "Control"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Control_organizationId_id_key" ON "Control"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Control_organizationId_templateId_key" ON "Control"("organizationId", "templateId");

-- CreateIndex
CREATE INDEX "ControlRequirement_organizationId_requirementId_idx" ON "ControlRequirement"("organizationId", "requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlRequirement_controlId_requirementId_key" ON "ControlRequirement"("controlId", "requirementId");

-- CreateIndex
CREATE INDEX "ControlReview_organizationId_controlId_reviewedAt_idx" ON "ControlReview"("organizationId", "controlId", "reviewedAt");

-- CreateIndex
CREATE INDEX "EvidenceRequirement_organizationId_controlId_idx" ON "EvidenceRequirement"("organizationId", "controlId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRequirement_organizationId_id_key" ON "EvidenceRequirement"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRequirement_id_control_key" ON "EvidenceRequirement"("id", "controlId");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_currentVersionId_key" ON "Evidence"("currentVersionId");

-- CreateIndex
CREATE INDEX "Evidence_organizationId_status_idx" ON "Evidence"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Evidence_organizationId_validUntil_idx" ON "Evidence"("organizationId", "validUntil");

-- CreateIndex
CREATE INDEX "Evidence_organizationId_deletedAt_idx" ON "Evidence"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Evidence_organizationId_uploadedById_idx" ON "Evidence"("organizationId", "uploadedById");

-- CreateIndex
CREATE INDEX "Evidence_title_trgm_idx" ON "Evidence" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Evidence_description_trgm_idx" ON "Evidence" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_organizationId_id_key" ON "Evidence"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceVersion_storageKey_key" ON "EvidenceVersion"("storageKey");

-- CreateIndex
CREATE INDEX "EvidenceVersion_organizationId_evidenceId_idx" ON "EvidenceVersion"("organizationId", "evidenceId");

-- CreateIndex
CREATE INDEX "EvidenceVersion_filename_trgm_idx" ON "EvidenceVersion" USING GIN ("originalFilename" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceVersion_evidenceId_versionNumber_key" ON "EvidenceVersion"("evidenceId", "versionNumber");

-- CreateIndex
CREATE INDEX "ControlEvidence_organizationId_controlId_idx" ON "ControlEvidence"("organizationId", "controlId");

-- CreateIndex
CREATE INDEX "ControlEvidence_organizationId_evidenceId_idx" ON "ControlEvidence"("organizationId", "evidenceId");

-- CreateIndex
CREATE INDEX "ControlEvidence_evidenceRequirementId_idx" ON "ControlEvidence"("evidenceRequirementId");

-- CreateIndex
CREATE INDEX "Task_organizationId_status_dueDate_idx" ON "Task"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_organizationId_assigneeId_status_idx" ON "Task"("organizationId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX "Task_organizationId_gapKey_idx" ON "Task"("organizationId", "gapKey");

-- CreateIndex
CREATE INDEX "Task_organizationId_riskId_idx" ON "Task"("organizationId", "riskId");

-- CreateIndex
CREATE INDEX "Task_title_trgm_idx" ON "Task" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Task_organizationId_number_key" ON "Task"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Task_organizationId_id_key" ON "Task"("organizationId", "id");

-- CreateIndex
CREATE INDEX "TaskControl_organizationId_controlId_idx" ON "TaskControl"("organizationId", "controlId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskControl_taskId_controlId_key" ON "TaskControl"("taskId", "controlId");

-- CreateIndex
CREATE INDEX "Risk_organizationId_status_severity_idx" ON "Risk"("organizationId", "status", "severity");

-- CreateIndex
CREATE INDEX "Risk_organizationId_gapKey_idx" ON "Risk"("organizationId", "gapKey");

-- CreateIndex
CREATE INDEX "Risk_title_trgm_idx" ON "Risk" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Risk_organizationId_number_key" ON "Risk"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Risk_organizationId_id_key" ON "Risk"("organizationId", "id");

-- CreateIndex
CREATE INDEX "RiskControl_organizationId_controlId_idx" ON "RiskControl"("organizationId", "controlId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskControl_riskId_controlId_key" ON "RiskControl"("riskId", "controlId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_occurredAt_idx" ON "AuditEvent"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_resourceType_resourceId_idx" ON "AuditEvent"("organizationId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_actorUserId_occurredAt_idx" ON "AuditEvent"("organizationId", "actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_action_idx" ON "AuditEvent"("organizationId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_chainKey_sequence_key" ON "AuditEvent"("chainKey", "sequence");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_recipientId_createdAt_idx" ON "Notification"("organizationId", "recipientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_recipientId_dedupeKey_key" ON "Notification"("recipientId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationCounter" ADD CONSTRAINT "OrganizationCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrameworkRequirement" ADD CONSTRAINT "FrameworkRequirement_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrameworkRequirement" ADD CONSTRAINT "FrameworkRequirement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FrameworkRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTemplate" ADD CONSTRAINT "ControlTemplate_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTemplateRequirement" ADD CONSTRAINT "ControlTemplateRequirement_controlTemplateId_fkey" FOREIGN KEY ("controlTemplateId") REFERENCES "ControlTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTemplateRequirement" ADD CONSTRAINT "ControlTemplateRequirement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "FrameworkRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRequirementTemplate" ADD CONSTRAINT "EvidenceRequirementTemplate_controlTemplateId_fkey" FOREIGN KEY ("controlTemplateId") REFERENCES "ControlTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFramework" ADD CONSTRAINT "OrganizationFramework_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFramework" ADD CONSTRAINT "OrganizationFramework_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFramework" ADD CONSTRAINT "OrganizationFramework_adoptedById_fkey" FOREIGN KEY ("adoptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFrameworkScope" ADD CONSTRAINT "OrganizationFrameworkScope_organizationFrameworkId_fkey" FOREIGN KEY ("organizationFrameworkId") REFERENCES "OrganizationFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFrameworkScope" ADD CONSTRAINT "OrganizationFrameworkScope_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "FrameworkRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Control" ADD CONSTRAINT "Control_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Control" ADD CONSTRAINT "Control_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Control" ADD CONSTRAINT "Control_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Control" ADD CONSTRAINT "Control_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ControlTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRequirement" ADD CONSTRAINT "ControlRequirement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRequirement" ADD CONSTRAINT "ControlRequirement_organizationId_controlId_fkey" FOREIGN KEY ("organizationId", "controlId") REFERENCES "Control"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRequirement" ADD CONSTRAINT "ControlRequirement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "FrameworkRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlReview" ADD CONSTRAINT "ControlReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlReview" ADD CONSTRAINT "ControlReview_organizationId_controlId_fkey" FOREIGN KEY ("organizationId", "controlId") REFERENCES "Control"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlReview" ADD CONSTRAINT "ControlReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRequirement" ADD CONSTRAINT "EvidenceRequirement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRequirement" ADD CONSTRAINT "EvidenceRequirement_organizationId_controlId_fkey" FOREIGN KEY ("organizationId", "controlId") REFERENCES "Control"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRequirement" ADD CONSTRAINT "EvidenceRequirement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EvidenceRequirementTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "EvidenceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceVersion" ADD CONSTRAINT "EvidenceVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceVersion" ADD CONSTRAINT "EvidenceVersion_organizationId_evidenceId_fkey" FOREIGN KEY ("organizationId", "evidenceId") REFERENCES "Evidence"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceVersion" ADD CONSTRAINT "EvidenceVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlEvidence" ADD CONSTRAINT "ControlEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlEvidence" ADD CONSTRAINT "ControlEvidence_organizationId_controlId_fkey" FOREIGN KEY ("organizationId", "controlId") REFERENCES "Control"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlEvidence" ADD CONSTRAINT "ControlEvidence_organizationId_evidenceId_fkey" FOREIGN KEY ("organizationId", "evidenceId") REFERENCES "Evidence"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlEvidence" ADD CONSTRAINT "ControlEvidence_requirement_same_control_fkey" FOREIGN KEY ("evidenceRequirementId", "controlId") REFERENCES "EvidenceRequirement"("id", "controlId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlEvidence" ADD CONSTRAINT "ControlEvidence_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskControl" ADD CONSTRAINT "TaskControl_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskControl" ADD CONSTRAINT "TaskControl_organizationId_taskId_fkey" FOREIGN KEY ("organizationId", "taskId") REFERENCES "Task"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskControl" ADD CONSTRAINT "TaskControl_organizationId_controlId_fkey" FOREIGN KEY ("organizationId", "controlId") REFERENCES "Control"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskControl" ADD CONSTRAINT "RiskControl_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskControl" ADD CONSTRAINT "RiskControl_organizationId_riskId_fkey" FOREIGN KEY ("organizationId", "riskId") REFERENCES "Risk"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskControl" ADD CONSTRAINT "RiskControl_organizationId_controlId_fkey" FOREIGN KEY ("organizationId", "controlId") REFERENCES "Control"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
