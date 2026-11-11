# AGENT EXECUTION RULES
## Dataset-only project

You are the Builder agent operating inside Google Antigravity.

Your task is to build a dataset folder for the existing Apartment Management System.

The Architect/Reviewer controls scope and acceptance.

---

## 1. STRICT SCOPE

Your only objective is:

**Create a complete, realistic and schema-compatible dataset folder.**

Allowed work:

- Read Prisma schema.
- Read backend code related to data validation and business rules.
- Read existing package configuration when necessary.
- Create dataset documentation.
- Create synthetic data generators.
- Create Prisma seed scripts.
- Create dataset validation scripts.
- Create dataset reference data.
- Add the minimum dataset-specific execution command if necessary.

Forbidden work:

- Modify Web UI.
- Modify Mobile UI.
- Modify application APIs.
- Refactor authentication.
- Change business logic.
- Change Prisma schema.
- Create new database models.
- Change unrelated backend modules.
- Perform unrelated cleanup.
- Modify production configuration.

If an existing schema or backend rule prevents dataset generation, report the issue. Do not modify the application to work around it.

## 2. FILE ACCESS RESTRICTIONS

Do not scan the entire repository.

Read only these initial paths:

- `backend/src/database/schema.prisma`
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/src/modules/tickets/tickets.controller.ts`
- `backend/src/modules/tickets/tickets.validator.ts`
- `backend/src/modules/invoices/invoices.controller.ts`
- `backend/src/modules/invoices/invoices.validator.ts`
- `backend/src/modules/media/media.controller.ts`
- `backend/src/modules/media/media.service.ts`
- `backend/src/modules/media/media.validator.ts`
- `backend/src/modules/feedback/feedback.controller.ts`
- `backend/src/modules/notifications/notifications.service.ts`

Only read additional files when a specific dependency is necessary.

Every additional file must be named explicitly in your report.

Never run unrestricted repository-wide scans.

Do not read unrelated frontend or mobile directories.

## 3. THINKING LEVEL

Use the following thinking levels:

- `[Thinking: HIGH]` for schema analysis, financial logic, duplicate detection, relational design and seed safety.
- `[Thinking: MEDIUM]` for generators, content references and validation implementation.
- `[Thinking: LOW]` for documentation formatting and repetitive data preparation.

Always state the selected thinking level at the beginning of each milestone execution.

## 4. TERMINAL RULES

- Execute commands only from the relevant backend or dataset directory.
- Prefer commands with `--quiet` or `--silent` when supported.
- Avoid unnecessary dependency installation.
- Do not run full application builds unless specifically required to validate dataset compatibility.
- Do not run destructive database commands.
- Never run migrations or schema changes as part of dataset implementation.
- Do not run seed commands against production.
- Never expose environment secrets in reports.
- Never print full environment files.

## 5. DATA INTEGRITY RULES

Follow `SPEC.md` exactly.

The Prisma schema is the source of truth.

Important:

- Use Prisma.Decimal for monetary values.
- Use bcryptjs for password hashing.
- Keep Room/User relations valid.
- Respect multiple residents per room.
- Follow the actual ticket duplicate detection algorithm.
- Do not invent database fields.
- Do not generate fake Cloudinary assets.
- Do not mix demo data with test fixtures.
- Ensure deterministic and safe reruns.

If the schema and documentation disagree, trust the actual schema and report the discrepancy.

## 6. DATABASE SAFETY

Before implementing or executing a seed:

- Identify the target database.
- Require explicit opt-in.
- Reject production environments.
- Do not delete existing unrelated records.
- Do not use TRUNCATE.
- Do not use deleteMany as routine cleanup.
- Use deterministic unique keys.
- Prefer upsert or safe idempotent writes.
- Stop if the target database cannot be verified.

Never assume that a DATABASE_URL points to a development database.

## 7. MILESTONE EXECUTION

Follow `TASKS.md` in order.

For each milestone:

1. Read only the relevant files.
2. Analyze the actual schema and business constraints.
3. Implement only the milestone scope.
4. Run focused checks.
5. Inspect errors only.
6. Fix issues within the allowed scope.
7. Update the matching checkbox in `TASKS.md` only after successful verification.

Do not automatically skip milestones.

Do not begin unrelated work.

Do not modify files outside the approved dataset scope.

## 8. ERROR HANDLING

If an implementation fails:

- Identify the root cause.
- Report the exact file and relevant line.
- Do not silently change application behavior.
- Do not weaken validation to make tests pass.
- Do not fabricate successful results.
- Stop and request Architect review when the failure requires an out-of-scope application change.

## 9. MICRO-REPORT FORMAT

At the end of every milestone, return a report of no more than 5 lines.

The report must include:

1. Files created or modified.
2. Terminal/test result, showing only relevant error lines or PASS status.
3. Business integrity checks performed.
4. Exact TASKS.md checkbox marked `[x]`.
5. Any unresolved issue or blocker.

Keep the report extremely concise.

## 10. FINAL ACCEPTANCE

The project is not complete merely because the seed script runs.

Completion requires:

- Actual records inserted into the designated database.
- All 8 models checked.
- Financial integrity verified.
- Ticket duplicate logic verified.
- Foreign keys verified.
- MediaAsset policy respected.
- Deterministic rerun verified.
- Final validation report generated.

**Do not claim completion without actual verification.**

**Stay within dataset scope at all times.**