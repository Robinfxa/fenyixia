# Supabase Legacy Architecture (Deprecated)

As of OpenSpec change `duckdb-openai-migration`, all backend functionality, database tables, auth, storage, and AI functions have been migrated to the self-hosted DuckDB backend service located in `server/` using OpenAI `5.6luna`.

- Database: Migrated to DuckDB (`server/src/db/`)
- Storage: Migrated to local static storage (`./uploads/`)
- Auth: Migrated to local JWT session (`server/src/routes/auth.ts`)
- AI: Migrated to OpenAI 5.6luna (`server/src/ai/openai.ts`)
- Admin: Migrated to `robinfxa@gmail.com`
