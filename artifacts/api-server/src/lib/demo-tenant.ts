/**
 * Fixed, well-known tenant ID for the public, no-passphrase "View Demo"
 * workspace. Seeded once by runTenantMigration() (see tenant-migration.ts)
 * and never created on the fly by the auth endpoint itself — see
 * routes/tenants.ts `POST /tenants/demo`.
 *
 * Using a constant id (instead of minting a fresh tenant per visitor) is
 * intentional: the demo is one shared, persistent dataset that every
 * visitor sees, not reset between viewers (see task spec "Out of scope").
 */
export const DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";
