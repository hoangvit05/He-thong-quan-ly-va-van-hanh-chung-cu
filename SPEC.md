# DATASET SPECIFICATION
## Apartment Management & Operation System

**Project:** He-thong-quan-ly-va-van-hanh-chung-cu  
**Scope:** Dataset only  
**Target directory:** `backend/dataset/`  
**Database:** PostgreSQL  
**ORM:** Prisma 5  
**Language:** TypeScript  
**Status:** Initial specification

---

## 1. OBJECTIVE

Build a complete, realistic, deterministic and relational dataset for the existing Apartment Management System.

The dataset must be compatible with the actual Prisma schema and backend business logic.

The only objective is to create and validate the dataset folder.

Do not develop or modify application features, Web UI, Mobile UI, APIs, authentication logic or unrelated backend modules.

Existing backend code may be read to understand data constraints and business rules.

## 2. SOURCE OF TRUTH

The authoritative schema is:

`backend/src/database/schema.prisma`

The actual schema contains exactly 8 models:

1. Room
2. User
3. Ticket
4. Invoice
5. Payment
6. Feedback
7. Notification
8. MediaAsset

The seed implementation must follow the actual schema, including every field, enum, relation, unique constraint and nullable field.

Do not trust outdated model descriptions in README files.

### Existing enums

**Role**
- ADMIN
- BQL
- TECHNICIAN
- RESIDENT

**TicketStatus**
- PENDING
- ASSIGNED
- IN_PROGRESS
- COMPLETED
- CLOSED

**InvoiceStatus**
- UNPAID
- PARTIALLY_PAID
- PAID

**RoomStatus**
- VACANT
- OCCUPIED
- MAINTENANCE

**PaymentMethod**
- VIETQR
- BANK_TRANSFER
- CASH

## 3. TARGET DATA VOLUME

Initial demo target:

| Model | Target |
|---|---:|
| Room | 100 |
| User | 108–158 |
| Ticket | 150–200 |
| Invoice | 400–600 |
| Payment | 300–500 |
| Feedback | 30–50 |
| Notification | 20–30 |
| MediaAsset | Only verified real assets |

These are targets, not permission to violate business constraints.

MediaAsset may legitimately contain zero records when no real Cloudinary assets are available.

## 4. DATA GENERATION PRINCIPLES

Use Faker.js or an equivalent deterministic generator for synthetic data.

Requirements:

- Vietnamese names and natural Vietnamese text.
- Realistic apartment numbers, floor numbers and areas.
- Realistic Vietnamese incident descriptions.
- Realistic Vietnamese feedback and building announcements.
- Demo-only phone numbers, emails and usernames.
- Never scrape or reproduce real residents' personal information.
- Use a fixed random seed.
- Generate relationships through actual Prisma records.
- Avoid arbitrary random values for financial amounts and workflow states.

Synthetic data must be generated first and inserted into PostgreSQL using Prisma.

Do not use frontend-only mock data as the primary dataset.

## 5. ROOM RULES

- Generate approximately 100 rooms.
- `roomNumber` is the only apartment identifier in the current schema.
- Do not invent `buildingId`, `block` or other database fields.
- Use realistic codes such as A-1204 or B-0902.
- `area` is Float in the current schema.
- Include VACANT, OCCUPIED and MAINTENANCE rooms.
- A room may have multiple residents.
- VACANT and MAINTENANCE rooms should not receive active resident assignments unless a documented business scenario requires it.

## 6. USER RULES

- Generate ADMIN, BQL, TECHNICIAN and RESIDENT users.
- Target staffing: 1 ADMIN, 2 BQL and 5 TECHNICIAN accounts.
- Generate 100–150 RESIDENT accounts.
- Staff accounts must have `roomId = null`.
- Residents may share the same `roomId`.
- Use bcryptjs to hash all passwords.
- Never store plaintext passwords.
- Use deterministic usernames and unique emails.
- Resident approval state must be realistic.
- Document demo login credentials separately from stored password hashes.

## 7. TICKET RULES

Follow the actual implementation in:

- `backend/src/modules/tickets/tickets.controller.ts`
- `backend/src/modules/tickets/tickets.validator.ts`

### Duplicate detection

The actual duplicate detection algorithm:

1. Compare `category` after trimming.
2. Consider only previous tickets created within the last 24 hours.
3. Eligible previous statuses:
   - PENDING
   - ASSIGNED
   - IN_PROGRESS
4. If the new ticket has a room:
   - Match the same `roomId`.
5. If it is a common-area ticket (`roomId = null`):
   - Match the same `residentId`.
   - Match `roomId = null`.
6. Set `isDuplicate` according to the existence of a matching previous ticket.

Never assign `isDuplicate = true` randomly.

### Ticket lifecycle

Use valid transitions:

- PENDING → ASSIGNED
- PENDING → CLOSED (cancellation)
- ASSIGNED → IN_PROGRESS
- ASSIGNED → PENDING
- ASSIGNED → CLOSED (manager cancellation)
- IN_PROGRESS → COMPLETED
- IN_PROGRESS → ASSIGNED
- COMPLETED → CLOSED (acceptance)
- COMPLETED → IN_PROGRESS (rework)
- CLOSED → IN_PROGRESS (manager reopening)

Additional requirements:

- ASSIGNED, IN_PROGRESS and COMPLETED tickets must have an appropriate technician.
- Technician must have role TECHNICIAN.
- PENDING tickets normally have no technician.
- CLOSED tickets may be cancellation records without a technician.
- Only tickets closed after COMPLETED acceptance may contain resident ratings.
- Rating must be within 1–5.
- Do not fabricate fields that do not exist in Prisma.
- Use `materials` as a nullable string.
- Do not assume a separate ticket status history model exists.
- Do not invent `completedAt` or other nonexistent columns.

## 8. INVOICE AND PAYMENT RULES

Follow:

- `backend/src/modules/invoices/invoices.controller.ts`
- `backend/src/modules/invoices/invoices.validator.ts`

Use Prisma.Decimal for every monetary calculation.

Never use JavaScript Float for money.

Invoice components:

- managementFee
- parkingFee
- waterFee
- otherFee

Required equation:

`totalAmount = managementFee + parkingFee + waterFee + otherFee`

Do not invent water meter readings. The schema only contains `waterFee`.

Other constraints:

- `month` uses YYYY-MM.
- Respect unique constraint `@@unique([roomId, month])`.
- `paidAmount` must equal the sum of related Payment.amount.
- No payment may exceed the remaining balance.
- UNPAID means paidAmount = 0.
- PARTIALLY_PAID means 0 < paidAmount < totalAmount.
- PAID means paidAmount = totalAmount.
- Generate multiple payments for some invoices.
- Generate fully unpaid invoices.
- Generate partially paid invoices.
- Generate fully paid invoices.
- Do not create payment records that do not contribute to the invoice's paidAmount.
- All calculations must use Decimal arithmetic.

## 9. FEEDBACK RULES

Follow the actual Feedback model.

Generate:

- Unresolved feedback.
- Resolved feedback.
- Feedback with replies.
- Feedback without replies.

Maintain sensible relationships between:

- `reply`
- `isResolved`
- `repliedAt`

Do not invent fields.

Every resident must reference an existing resident account.

## 10. NOTIFICATION RULES

Generate Vietnamese building announcements.

Examples:

- Maintenance schedule.
- Elevator maintenance.
- Water supply interruption.
- Parking regulations.
- Fire safety announcements.
- Monthly fee reminders.
- Community activities.

Use valid `targetRoom` values or null for building-wide announcements.

For ordinary demo notifications, `authorId` must reference an existing ADMIN or BQL account.

Do not assume `authorId` is required by the Prisma schema.

## 11. MEDIAASSET RULES

MediaAsset is a special case.

The backend uses Cloudinary Direct Signed Upload.

Relevant implementation:

- `backend/src/modules/media/media.controller.ts`
- `backend/src/modules/media/media.service.ts`
- `backend/src/modules/media/media.validator.ts`

Never:

- Generate fake Cloudinary URLs.
- Invent Cloudinary public IDs.
- Insert arbitrary metadata and set `isConfirmed = true`.
- Bypass backend verification.
- Insert fake assets to improve dashboard statistics.

Only create MediaAsset records when real assets have been uploaded and verified through the existing Cloudinary backend flow.

Verified metadata must come from Cloudinary Admin API and include actual:

- publicId
- url
- resourceType
- deliveryType
- purpose
- bytes
- format
- width
- height
- duration
- uploaderId
- ticketId
- isConfirmed
- confirmedAt

When no real assets are available, leave MediaAsset empty.

## 12. DATASET FOLDER STRUCTURE

Target:

`backend/dataset/`

Proposed structure:

```text
backend/dataset/
├── README.md
├── SPEC.md
├── DATA_DICTIONARY.md
├── config/
│   └── dataset.config.ts
├── seed/
│   ├── index.ts
│   ├── generators/
│   │   ├── room.generator.ts
│   │   ├── user.generator.ts
│   │   ├── ticket.generator.ts
│   │   ├── invoice.generator.ts
│   │   ├── payment.generator.ts
│   │   ├── feedback.generator.ts
│   │   └── notification.generator.ts
│   └── utils/
│       ├── random.ts
│       ├── password.ts
│       └── decimal.ts
├── reference-data/
│   ├── ticket-categories.json
│   └── vietnamese-content.json
├── fixtures/
│   └── README.md
├── validation/
│   ├── validate.ts
│   └── checks/
│       ├── relational.check.ts
│       ├── financial.check.ts
│       ├── ticket.check.ts
│       ├── media.check.ts
│       └── counts.check.ts
└── reports/
    └── .gitkeep
```

Only create files that are actually needed. Do not create empty placeholder modules without purpose.

Do not modify application modules.

A dataset-specific command may be added to `backend/package.json` only if necessary to run the dataset scripts.

## 13. SEED SAFETY

The seed process must:

- Be deterministic.
- Be safe to rerun.
- Use stable unique keys.
- Preserve foreign key integrity.
- Avoid destructive database operations.
- Never use `deleteMany()` or `TRUNCATE` as a routine seed strategy.
- Never run against production.
- Require explicit opt-in before writing to a database.
- Validate the target database environment before writing.
- Prefer upsert or other safe idempotent operations.
- Use transactions where appropriate.

Do not overwrite unrelated existing records.

Do not mix demo seed data with unit-test or integration-test fixtures.

## 14. VALIDATION REQUIREMENTS

The validation process must inspect actual PostgreSQL records.

At minimum, validate:

1. Actual row counts for all 8 models.
2. Foreign key integrity.
3. Room and resident consistency.
4. Staff role and room assignment consistency.
5. Bcrypt password hashes.
6. Ticket state and technician consistency.
7. Duplicate-ticket correctness.
8. Rating consistency.
9. Invoice component totals.
10. Payment aggregation and invoice status.
11. Feedback reply consistency.
12. Notification author consistency.
13. MediaAsset verification consistency.
14. Deterministic rerun behavior.

Generate a validation report containing:

- Actual counts.
- Expected counts.
- Passed checks.
- Failed checks.
- Detailed failure reasons.
- MediaAsset verification status.

A successful seed command alone is not sufficient for acceptance.

## 15. ACCEPTANCE CRITERIA

The dataset is complete only when:

- All generated records conform to the actual Prisma schema.
- All business consistency checks pass.
- Financial calculations are exact.
- Ticket duplicate flags follow backend logic.
- All foreign keys are valid.
- Passwords are hashed.
- MediaAsset records are genuine and verified, or absent.
- Rerunning the seed does not create unintended duplicates.
- The README explains how to configure, run and validate the dataset.
- The validation report reflects actual database contents.

**Final principle: Adapt the dataset to the existing application. Never modify the application merely to accommodate fabricated dataset assumptions.**