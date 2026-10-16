#!/usr/bin/env bash
set -euo pipefail

container_id=${1:?PostgreSQL CI service container id required}
cd "$(dirname "$0")/../../.."
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

psql_ci() {
  local db_name=$1
  docker exec -i -u postgres "$container_id" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d "$db_name" -q
}

new_db() {
  local db_name=$1
  docker exec -u postgres "$container_id" createdb -U postgres "$db_name"
  psql_ci "$db_name" < supabase/tests/ci/media_schema.sql
}

expect_failure() {
  local db_name=$1 expected=$2
  shift 2
  local output="$scratch/$db_name.log"
  if cat "$@" | psql_ci "$db_name" > "$output" 2>&1; then
    printf 'ERROR: unapplied baseline unexpectedly passed: %s\n' "$db_name" >&2
    exit 1
  fi
  if ! grep -Fq "$expected" "$output"; then
    printf 'ERROR: baseline failed for an unexpected reason: %s\n' "$db_name" >&2
    grep -m1 'ERROR:' "$output" >&2 || true
    exit 1
  fi
  printf 'Expected red baseline: %s (%s)\n' "$db_name" "$expected"
}

new_db audit_ci
expect_failure audit_ci 'function partner_configuration_private.media_ref' \
  supabase/tests/microsite_media_audit_staging_setup.sql \
  supabase/tests/microsite_media_audit.test.sql
cat \
  supabase/tests/microsite_media_audit_staging_setup.sql \
  supabase/migrations/20261016121005_audit_microsite_media_references.sql \
  supabase/tests/microsite_media_audit.test.sql | psql_ci audit_ci
printf 'PASS: actual audit migration and SQL regression\n'

new_db storage_ci
expect_failure storage_ci 'both storage media guards are required' \
  supabase/tests/partner_media_storage_immutability.test.sql
cat \
  supabase/migrations/20261016123339_protect_partner_media_objects.sql \
  supabase/tests/partner_media_storage_immutability.test.sql | psql_ci storage_ci
printf 'PASS: actual storage RLS migration and SQL regression\n'

new_db projector_ci
{
  # pg_get_functiondef returns alphabetical order, not dependency order.
  # Runtime calls in the unchanged regression still validate the exact bodies.
  printf 'set check_function_bodies=off;\n'
  cat supabase/tests/ci/public_projector_query_key_baseline.sql
  cat supabase/tests/ci/public_projector_baseline.sql
  # Reproduce the recorded production ACL for the exact function the test checks.
  printf '%s\n' \
    'revoke all on function private.microsite_public_element_v1(text) from public;' \
    'grant execute on function private.microsite_public_element_v1(text) to postgres;'
} | psql_ci projector_ci
expect_failure projector_ci 'new location-image alt must survive' \
  supabase/tests/microsite_location_image_alt.test.sql
cat \
  supabase/migrations/20261016123019_preserve_microsite_location_image_alt.sql \
  supabase/tests/microsite_location_image_alt.test.sql | psql_ci projector_ci
printf 'PASS: actual public projector migration and SQL regression\n'
