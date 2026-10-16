#!/usr/bin/env bash
set -euo pipefail

postgres_id=${1:?Disposable PostgreSQL CI container id required}
cd "$(dirname "$0")/../../.."
scratch=$(mktemp -d)
storage_id=
cleanup() {
  if [[ -n "$storage_id" ]]; then docker rm -f "$storage_id" >/dev/null 2>&1 || true; fi
  rm -rf "$scratch"
}
trap cleanup EXIT

# The GitHub-hosted runner's service network and address are for this job only.
read -r network postgres_ip < <(docker inspect "$postgres_id" | node -e '
  let input = "";
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const networks = Object.entries(JSON.parse(input)[0].NetworkSettings.Networks);
    if (networks.length !== 1) process.exit(1);
    process.stdout.write(`${networks[0][0]} ${networks[0][1].IPAddress}\n`);
  });
')
[[ -n "$network" && -n "$postgres_ip" ]] || { echo 'Missing disposable PostgreSQL network' >&2; exit 1; }

# This fixed test key signs only synthetic JWTs inside an isolated CI network.
jwt_secret='disposable-storage-http-ci-key-20261016-only'
token=$(JWT_SECRET="$jwt_secret" node -e '
  const crypto = require("node:crypto");
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({alg:"HS256",typ:"JWT"})}.${encode({aud:"authenticated",role:"authenticated",sub:"00000000-0000-4000-8000-000000000001",iat:now,exp:now+600})}`;
  process.stdout.write(`${input}.${crypto.createHmac("sha256",process.env.JWT_SECRET).update(input).digest("base64url")}`);
')

storage_id=$(docker run -d --rm --network "$network" \
  -p 127.0.0.1:5000:5000 \
  -e DATABASE_URL="postgres://postgres:disposable-ci-only@${postgres_ip}:5432/postgres" \
  -e AUTH_JWT_SECRET="$jwt_secret" \
  -e DB_INSTALL_ROLES=true \
  -e STORAGE_BACKEND=file \
  -e FILE_STORAGE_BACKEND_PATH=/tmp/storage \
  -e GLOBAL_S3_BUCKET=ci-local \
  -e TENANT_ID=ci-local \
  -e REGION=local \
  -e FILE_SIZE_LIMIT=1048576 \
  -e ENABLE_IMAGE_TRANSFORMATION=false \
  -e S3_PROTOCOL_ENABLED=false \
  supabase/storage-api:v1.81.0)

ready=false
for _ in {1..45}; do
  if curl -fsS --max-time 2 http://127.0.0.1:5000/status >/dev/null 2>&1; then
    ready=true
    break
  fi
  if [[ "$(docker inspect -f '{{.State.Running}}' "$storage_id")" != true ]]; then break; fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  echo 'Storage API did not become healthy on the disposable CI database' >&2
  docker logs --tail 60 "$storage_id" >&2 || true
  exit 1
fi

cat supabase/tests/ci/storage_http_setup.sql \
    supabase/migrations/20261016123339_protect_partner_media_objects.sql |
  docker exec -i -u postgres "$postgres_id" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -q

upload() {
  local bucket=$1 name=$2 file=$3
  curl -sS --max-time 15 -o "$scratch/response" -w '%{http_code}' \
    -X POST -H "Authorization: Bearer $token" -H 'x-upsert: true' \
    -H 'Content-Type: text/plain' --data-binary "@$file" \
    "http://127.0.0.1:5000/object/$bucket/$name"
}
download() {
  local bucket=$1 name=$2 output=$3
  curl -fsS --max-time 15 -o "$output" "http://127.0.0.1:5000/object/public/$bucket/$name"
}
remove_object() {
  local bucket=$1 name=$2
  curl -sS --max-time 15 -o "$scratch/response" -w '%{http_code}' \
    -X DELETE -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    --data "{\"prefixes\":[\"$name\"]}" \
    "http://127.0.0.1:5000/object/$bucket"
}
expect_success() {
  [[ "$1" =~ ^2[0-9][0-9]$ ]] || { echo "Expected HTTP success; got $1" >&2; head -c 300 "$scratch/response" >&2; exit 1; }
}
expect_rejection() {
  [[ "$1" =~ ^[45][0-9][0-9]$ ]] || { echo "Expected HTTP rejection; got $1" >&2; head -c 300 "$scratch/response" >&2; exit 1; }
}

printf 'original partner bytes' > "$scratch/original"
printf 'replacement partner bytes' > "$scratch/replacement"
for bucket in partner-assets menu-videos; do
  expect_success "$(upload "$bucket" ci/immutable.txt "$scratch/original")"
  download "$bucket" ci/immutable.txt "$scratch/readback"
  cmp "$scratch/original" "$scratch/readback"

  expect_rejection "$(upload "$bucket" ci/immutable.txt "$scratch/replacement")"
  download "$bucket" ci/immutable.txt "$scratch/readback"
  cmp "$scratch/original" "$scratch/readback"

  expect_rejection "$(remove_object "$bucket" ci/immutable.txt)"
  download "$bucket" ci/immutable.txt "$scratch/readback"
  cmp "$scratch/original" "$scratch/readback"
done

expect_success "$(upload ci-other-media ci/mutable.txt "$scratch/original")"
expect_success "$(upload ci-other-media ci/mutable.txt "$scratch/replacement")"
download ci-other-media ci/mutable.txt "$scratch/readback"
cmp "$scratch/replacement" "$scratch/readback"
expect_success "$(remove_object ci-other-media ci/mutable.txt)"
printf 'PASS: Storage HTTP new upsert, immutable partner/menu bytes and unaffected other bucket\n'
