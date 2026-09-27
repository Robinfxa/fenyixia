## Purpose

Provides a lightweight self-hosted backend service powered by an embedded DuckDB database engine, replacing Supabase for persistent multi-tenant data management, ACID transactions, and local file storage.

## ADDED Requirements

### Requirement: Embedded DuckDB engine
The backend service SHALL embed an in-process DuckDB database instance storing all business tables (users, bills, bill_items, bill_item_members, friendships, invitations, friend_requests, groups, group_members, user_tags, friend_tags, payment_proofs, bill_disputes, api_tokens).

#### Scenario: Database startup and schema verification
- **WHEN** the backend service starts
- **THEN** it connects to the local DuckDB database file, creates required tables if missing, and validates integrity

### Requirement: Atomic transaction execution for bills
The backend service SHALL execute bill creation and updates as atomic ACID transactions within DuckDB, ensuring either all bill headers, line items, and member assignments succeed, or none are applied.

#### Scenario: Atomic bill creation
- **WHEN** a client sends a POST request to `/api/bills` with bill headers, items, and member assignments
- **THEN** the backend writes all rows within a single database transaction and returns the created bill entity

#### Scenario: Transaction rollback on failure
- **WHEN** writing bill items or members fails due to invalid data or database error
- **THEN** the entire transaction is rolled back and no orphan bill records are created

### Requirement: Local filesystem storage for uploads
The backend service SHALL accept receipt images and payment proof screenshots, store them in the local `./uploads/` directory, and expose them via public static HTTP endpoints.

#### Scenario: Upload payment proof
- **WHEN** a user uploads a payment proof image file to `/api/upload/proof`
- **THEN** the file is saved to `./uploads/proofs/` and a relative static URL is returned to the client
