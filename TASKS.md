# DATASET IMPLEMENTATION TASKS

Project: Apartment Management Dataset  
Target: `backend/dataset/`

Only work on dataset-related files and the minimum dataset-specific execution configuration.

---

## MILESTONE 01 — REPOSITORY AND SCHEMA AUDIT

- [ ] Read `backend/src/database/schema.prisma`.
- [ ] Confirm all 8 models and 5 enums.
- [ ] Inspect ticket lifecycle and duplicate detection.
- [ ] Inspect invoice and payment calculation logic.
- [ ] Inspect media verification workflow.
- [ ] Inspect existing backend dependencies and TypeScript configuration.
- [ ] Identify existing seed scripts, if any.
- [ ] Record exact fields, relations and constraints.
- [ ] Report discrepancies between old documentation and actual schema.

Expected output:
- `backend/dataset/SPEC.md`
- `backend/dataset/DATA_DICTIONARY.md`

## MILESTONE 02 — DATASET FOLDER FOUNDATION

- [ ] Create the dataset folder structure.
- [ ] Create dataset configuration.
- [ ] Define fixed random seed.
- [ ] Define target record counts.
- [ ] Define safe database environment checks.
- [ ] Define dataset namespace and deterministic identifiers.
- [ ] Document setup and execution instructions.

Expected output:
- `backend/dataset/README.md`
- `backend/dataset/config/dataset.config.ts`

## MILESTONE 03 — REFERENCE DATA AND VIETNAMESE CONTENT

- [ ] Define ticket categories.
- [ ] Create realistic Vietnamese incident descriptions.
- [ ] Create Vietnamese feedback content.
- [ ] Create Vietnamese building announcement content.
- [ ] Document any public data references.
- [ ] Ensure no real resident personal information is used.

Expected output:
- `backend/dataset/reference-data/`

## MILESTONE 04 — ROOM AND USER GENERATORS

- [ ] Generate approximately 100 rooms.
- [ ] Include VACANT, OCCUPIED and MAINTENANCE scenarios.
- [ ] Generate 1 ADMIN.
- [ ] Generate 2 BQL accounts.
- [ ] Generate 5 TECHNICIAN accounts.
- [ ] Generate 100–150 RESIDENT accounts.
- [ ] Allow multiple residents per room.
- [ ] Keep staff roomId null.
- [ ] Hash all passwords with bcryptjs.
- [ ] Ensure unique usernames and emails.

Expected output:
- `backend/dataset/seed/generators/room.generator.ts`
- `backend/dataset/seed/generators/user.generator.ts`
- `backend/dataset/seed/utils/password.ts`

## MILESTONE 05 — INVOICE AND PAYMENT GENERATORS

- [ ] Generate 400–600 invoices.
- [ ] Respect unique roomId/month constraint.
- [ ] Generate all four fee components.
- [ ] Use Prisma.Decimal for all calculations.
- [ ] Generate unpaid invoices.
- [ ] Generate partially paid invoices.
- [ ] Generate fully paid invoices.
- [ ] Generate 300–500 payment records.
- [ ] Ensure sum(Payment.amount) equals Invoice.paidAmount.
- [ ] Ensure no overpayment.
- [ ] Ensure invoice status matches actual paid amount.

Expected output:
- `backend/dataset/seed/generators/invoice.generator.ts`
- `backend/dataset/seed/generators/payment.generator.ts`
- `backend/dataset/seed/utils/decimal.ts`

## MILESTONE 06 — TICKET GENERATOR

- [ ] Generate 150–200 tickets.
- [ ] Generate all valid ticket statuses.
- [ ] Ensure technicians have the correct role.
- [ ] Ensure valid technician assignments.
- [ ] Include common-area tickets.
- [ ] Include duplicate and non-duplicate scenarios.
- [ ] Reproduce the exact 24-hour duplicate detection algorithm.
- [ ] Use only eligible previous ticket statuses.
- [ ] Generate completed and closed scenarios.
- [ ] Generate ratings only for accepted completion cases.
- [ ] Generate realistic materials descriptions.

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