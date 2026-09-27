## Purpose

Integrates OpenAI's `5.6luna` model authenticated via OAuth session credentials to perform multimodal receipt OCR, itemized extraction, Ontario HST tax adjustments, and automated bill dispute arbitration.

## ADDED Requirements

### Requirement: OAuth session authorization for OpenAI
The service SHALL communicate with OpenAI's API using an OAuth session token (equivalent to Codex / ChatGPT subscription session authentication), without requiring a static API key.

#### Scenario: Token-based model invocation
- **WHEN** the backend invokes the OpenAI API for receipt scanning or dispute resolution
- **THEN** it passes the active OAuth session Bearer token in the Authorization header

### Requirement: Multimodal receipt scanning with 5.6luna
The service SHALL submit receipt images (supporting multi-segment long receipts) to OpenAI's `5.6luna` model and parse the structured JSON response containing item names, unit prices, quantities, and embedded Ontario 13% HST tax calculations.

#### Scenario: Multi-image receipt parsing
- **WHEN** one or more receipt images are submitted to `/api/scan-receipt`
- **THEN** the backend invokes `5.6luna`, strips Markdown blocks from the response, and returns parsed line items

### Requirement: AI dispute arbitration
The service SHALL submit bill items and natural language dispute explanations to `5.6luna` to generate suggested reassignment diffs while preserving original item names, prices, and quantities.

#### Scenario: Generate dispute recommendation
- **WHEN** a member submits an arbitration request with reason "I didn't drink any beer"
- **THEN** `5.6luna` returns an adjusted member assignment mapping excluding the challenger from alcohol items
