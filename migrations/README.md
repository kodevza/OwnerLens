# Migrations

Migration files are append-only history for the DuckDB runtime schema.

Do not edit, rename, reorder, or delete existing migration files after they have been committed or shared. If the schema needs to change, add a new migration with the next numeric prefix, for example:

```text
005_short_description.sql
```

Each migration should contain only the SQL needed for that step and should preserve compatibility with databases that already ran earlier migrations.
