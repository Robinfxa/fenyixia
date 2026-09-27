## REMOVED Requirements

### Requirement: Typed Supabase client
**Reason**: Supabase is deprecated in favor of an embedded DuckDB backend service.
**Migration**: Import typed API client functions from `src/lib/api/` targeting the local DuckDB service.

## MODIFIED Requirements

### Requirement: Bills CRUD operations
The client API layer SHALL provide typed async functions: `fetchMyBills()`, `createBill()`, `updateBill()`, `deleteBill()`, `toggleSettled()` connecting to the backend service. Return types SHALL use TypeScript interfaces matching the existing data shape (`Bill`, `BillItem`, `User`).

#### Scenario: Fetch bills
- **WHEN** `fetchMyBills()` is called
- **THEN** it requests `/api/bills` and returns bills where the current user is payer or member, normalized with `items`, `members`, `per_amount`, `my_share`

#### Scenario: Create bill with items
- **WHEN** `createBill()` is called with bill data including items and member IDs
- **THEN** it posts to `/api/bills` and returns the created bill entity

### Requirement: Payment proof operations
The client API layer SHALL provide `uploadPaymentProof(billId, file)` and `getPaymentProofs(billId)`.

#### Scenario: Upload proof
- **WHEN** `uploadPaymentProof()` is called with a bill ID and image file
- **THEN** the file is uploaded to the backend storage endpoint `/api/upload/proof` and a record is created in the database
