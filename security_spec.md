# Security Specification - MedNotes

## Data Invariants
1. All records (invoices, surgeries, payments, etc.) MUST belong to a specific user via `userId`.
2. A user can only read, create, update, or delete their own data.
3. Timestamps like `createdAt` must be server-generated.
4. Identifiers (hospitalId, payerId) should be valid strings.

## The "Dirty Dozen" Payloads (Denial Tests)
1. **Identity Spoofing**: Creating an invoice with someone else's `userId`.
2. **Access Violation**: Reading an invoice belonging to another `userId`.
3. **Ghost Fields**: Adding a field `isVerified: true` to an invoice update.
4. **Invalid Type**: Sending a string for `grossAmount` instead of a number.
5. **Timestamp Forge**: Manually setting `createdAt` to a past date.
6. **Orphaned Write**: Creating a surgery referencing a non-existent `userId` (via path variable mismatch).
7. **Size Attack**: Injecting a 1MB string into the `patientName` field.
8. **Negative Value**: Setting `grossAmount` to -100.
9. **Identity Poisoning**: Using a 2KB junk string as a document ID.
10. **State Shortcut**: Modifying a read-only field (if we had any, like `originalPayerName` after creation).
11. **Illegal Query**: Attempting to list ALL invoices without a `userId` filter.
12. **Anonymous Write**: Attempting to write without being authenticated.

## The Test Runner (Mock Tests)
See `firestore.rules.test.ts` for implementation details.
