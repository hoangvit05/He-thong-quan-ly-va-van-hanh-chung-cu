# DATASET IMPLEMENTATION TASKS

Project: Apartment Management Dataset  
Target: `backend/dataset/`

Only work on dataset-related files and the minimum dataset-specific execution configuration.

---

## MILESTONE 01 — REPOSITORY AND SCHEMA AUDIT

- [x] Read `backend/src/database/schema.prisma`.
- [x] Confirm all 8 models and 5 enums.
- [x] Inspect ticket lifecycle and duplicate detection.
- [x] Inspect invoice and payment calculation logic.
- [x] Inspect media verification workflow.
- [x] Inspect existing backend dependencies and TypeScript configuration.
- [x] Identify existing seed scripts, if any.
- [x] Record exact fields, relations and constraints.
- [x] Report discrepancies between old documentation and actual schema.

Expected output:
- `backend/dataset/SPEC.md`
- `backend/dataset/DATA_DICTIONARY.md`

## MILESTONE 02 — DATASET FOLDER FOUNDATION

- [x] Create the dataset folder structure.
- [x] Create dataset configuration.
- [x] Define fixed random seed.
- [x] Define target record counts.
- [x] Define safe database environment checks.
- [x] Define dataset namespace and deterministic identifiers.
- [x] Document setup and execution instructions.

Expected output:
- `backend/dataset/README.md`
- `backend/dataset/config/dataset.config.ts`

## MILESTONE 03 — REFERENCE DATA AND VIETNAMESE CONTENT

- [x] Define ticket categories.
- [x] Create realistic Vietnamese incident descriptions.
- [x] Create Vietnamese feedback content.
- [x] Create Vietnamese building announcement content.
- [x] Document any public data references.
- [x] Ensure no real resident personal information is used.

Expected output:
- `backend/dataset/reference-data/`

## MILESTONE 04 — ROOM AND USER GENERATORS

- [x] Generate approximately 100 rooms.
- [x] Include VACANT, OCCUPIED and MAINTENANCE scenarios.
- [x] Generate 1 ADMIN.
- [x] Generate 2 BQL accounts.
- [x] Generate 5 TECHNICIAN accounts.
- [x] Generate 100–150 RESIDENT accounts.
- [x] Allow multiple residents per room.
- [x] Keep staff roomId null.
- [x] Hash all passwords with bcryptjs.
- [x] Ensure unique usernames and emails.

Expected output:
- `backend/dataset/seed/generators/room.generator.ts`
- `backend/dataset/seed/generators/user.generator.ts`
- `backend/dataset/seed/utils/password.ts`

## MILESTONE 05 — INVOICE AND PAYMENT GENERATORS

- [x] Generate 400–600 invoices.
- [x] Respect unique roomId/month constraint.
- [x] Generate all four fee components.
- [x] Use Prisma.Decimal for all calculations.
- [x] Generate unpaid invoices.
- [x] Generate partially paid invoices.
- [x] Generate fully paid invoices.
- [x] Generate 300–500 payment records.
- [x] Ensure sum(Payment.amount) equals Invoice.paidAmount.
- [x] Ensure no overpayment.
- [x] Ensure invoice status matches actual paid amount.

Expected output:
- `backend/dataset/seed/generators/invoice.generator.ts`
- `backend/dataset/seed/generators/payment.generator.ts`
- `backend/dataset/seed/utils/decimal.ts`

## MILESTONE 06 — TICKET GENERATOR

- [x] Generate 150–200 tickets.
- [x] Generate all valid ticket statuses.
- [x] Ensure technicians have the correct role.
- [x] Ensure valid technician assignments.
- [x] Include common-area tickets.
- [x] Include duplicate and non-duplicate scenarios.
- [x] Reproduce the exact 24-hour duplicate detection algorithm.
- [x] Use only eligible previous ticket statuses.
- [x] Generate completed and closed scenarios.
- [x] Generate ratings only for accepted completion cases.
- [x] Generate realistic materials descriptions.

Expected output:
- `backend/dataset/seed/generators/ticket.generator.ts`

## MILESTONE 07 — FEEDBACK AND NOTIFICATION GENERATORS

- [ ] Generate 30–50 feedback records.
- [ ] Generate resolved and unresolved scenarios.
- [ ] Generate replies and repliedAt consistently.
- [ ] Generate 20–30 building notifications.
- [ ] Use valid ADMIN/BQL authors.
- [ ] Use valid targetRoom values or null.
- [ ] Generate realistic Vietnamese content.

Expected output:
- `backend/dataset/seed/generators/feedback.generator.ts`
- `backend/dataset/seed/generators/notification.generator.ts`

## MILESTONE 08 — MEDIA ASSET POLICY AND REAL ASSET INTEGRATION

- [ ] Inspect the existing Cloudinary Direct Signed Upload flow.
- [ ] Document the legitimate upload and confirmation process.
- [ ] Never fabricate Cloudinary URLs.
- [ ] Never invent public IDs or verified metadata.
- [ ] Keep MediaAsset empty when no real verified assets exist.
- [ ] If genuine assets are supplied, verify them through the backend workflow.
- [ ] Preserve all MediaAsset schema fields.

Expected output:
- Dataset media instructions and verification documentation.

## MILESTONE 09 — PRISMA SEED ORCHESTRATION

- [ ] Implement deterministic seed orchestration.
- [ ] Respect foreign key dependencies.
- [ ] Use safe idempotent operations.
- [ ] Protect production databases.
- [ ] Require explicit opt-in before writing.
- [ ] Avoid destructive cleanup.
- [ ] Keep unit/integration fixtures separate.
- [ ] Add a dataset-specific execution command if needed.
- [ ] Confirm successful execution on an explicitly designated demo database.

Expected output:
- `backend/dataset/seed/index.ts`

## MILESTONE 10 — VALIDATION AND FINAL ACCEPTANCE

- [ ] Validate all 8 models.
- [ ] Validate row counts.
- [ ] Validate foreign keys.
- [ ] Validate user roles and room assignments.
- [ ] Validate password hashes.
- [ ] Validate ticket states and duplicate flags.
- [ ] Validate invoice totals and payment sums.
- [ ] Validate feedback consistency.
- [ ] Validate notification authors.
- [ ] Validate MediaAsset verification.
- [ ] Test deterministic reruns.
- [ ] Generate a final validation report.
- [ ] Complete README documentation.
- [ ] Confirm that only dataset-related files were changed.

Expected output:
- `backend/dataset/validation/`
- `backend/dataset/reports/`
- `backend/dataset/README.md`

---

## COMPLETION RULE

A milestone may only be marked `[x]` after its implementation and relevant checks pass.

Do not mark a task complete based only on file creation.

Do not skip failed checks.

Do not modify unrelated application code to force a milestone to pass.