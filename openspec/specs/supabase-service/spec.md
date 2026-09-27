## Requirements

### Requirement: Typed Supabase client
The app SHALL initialize a Supabase client using environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. All service functions SHALL be exported as ES modules (not `window.DB`).

#### Scenario: Client initialization
- **WHEN** the app starts
- **THEN** a Supabase client is created from env vars and available for import

### Requirement: Bills CRUD operations
The service SHALL provide typed async functions: `fetchMyBills()`, `createBill()`, `updateBill()`, `deleteBill()`, `toggleSettled()`. Return types SHALL use TypeScript interfaces matching the existing data shape (`Bill`, `BillItem`, `User`).

#### Scenario: Fetch bills
- **WHEN** `fetchMyBills()` is called
- **THEN** it returns bills where the current user is payer or member, normalized with `items`, `members`, `per_amount`, `my_share`

#### Scenario: Create bill with items
- **WHEN** `createBill()` is called with bill data including items and member IDs
- **THEN** it inserts the bill, bill items, and bill item members in Supabase

### Requirement: Payment proof operations
The service SHALL provide `uploadPaymentProof(billId, file)` and `getPaymentProofs(billId)` with the same behavior as the existing `supabase.js` functions.

#### Scenario: Upload proof
- **WHEN** `uploadPaymentProof()` is called with a bill ID and image file
- **THEN** the file is uploaded to Supabase storage and a record is inserted in `payment_proofs`

### Requirement: Reaction operations
The service SHALL provide `addAnger(billId)`, `getUnseenAnger()`, and `markAngerSeen(reactionIds)`.

#### Scenario: Add anger to bill
- **WHEN** `addAnger()` is called for a bill
- **THEN** it increments the anger count for the current user on that bill

### Requirement: Auth operations
The service SHALL provide `getCurrentUser()`, `signUp()`, `signIn()`, `signOut()`, and `onAuthChange()` wrapping Supabase auth.

#### Scenario: Sign in
- **WHEN** `signIn(email, password)` is called with valid credentials
- **THEN** it returns the authenticated user session

### Requirement: Friend operations
The service SHALL provide `getFriends()` and `addFriend(email)` matching existing behavior.

#### Scenario: Get friends list
- **WHEN** `getFriends()` is called
- **THEN** it returns all friends of the current user with `id`, `name`, `emoji`
