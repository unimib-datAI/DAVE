#!/usr/bin/env bash
#
# DAVE installer - interactive setup of .env and (optionally) docker compose
#
# Asks only for the values that actually need a human decision, generates
# secrets for the rest, shows a full summary, and writes .env only after
# you confirm it.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# ----------------------------------------------------------------------------
# Output helpers
# ----------------------------------------------------------------------------
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'

say()     { printf '%s\n' "$*"; }
step()    { printf '\n%s==>%s %s\n' "$BLUE" "$NC" "$*"; }
info()    { printf '  %s\n' "$*"; }
warn()    { printf '  %s! %s%s\n' "$YELLOW" "$*" "$NC"; }
ok()      { printf '  %s✓%s %s\n' "$GREEN" "$NC" "$*"; }
err()     { printf '%s✗ %s%s\n' "$RED" "$*" "$NC" >&2; }
die()     { err "$*"; exit 1; }

ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help)
      cat <<EOF
DAVE installer

Usage: ./install.sh [--yes]

  --yes   Non-interactive: accept every default without prompting
          (secrets are still freshly generated).
EOF
      exit 0
      ;;
  esac
done

# ----------------------------------------------------------------------------
# Prompt helpers
# ----------------------------------------------------------------------------

# ask VAR "question" "default"
ask() {
  local __var="$1" __question="$2" __default="$3" __reply
  if [ "$ASSUME_YES" -eq 1 ]; then
    printf -v "$__var" '%s' "$__default"
    return
  fi
  if [ -n "$__default" ]; then
    read -r -p "$(printf '%s [%s]: ' "$__question" "$__default")" __reply || true
  else
    read -r -p "$(printf '%s: ' "$__question")" __reply || true
  fi
  printf -v "$__var" '%s' "${__reply:-$__default}"
}

# ask_yn VAR "question" "y|n" (default)
ask_yn() {
  local __var="$1" __question="$2" __default="$3" __reply __hint="y/N"
  [ "$__default" = "y" ] && __hint="Y/n"
  if [ "$ASSUME_YES" -eq 1 ]; then
    printf -v "$__var" '%s' "$__default"
    return
  fi
  read -r -p "$(printf '%s [%s]: ' "$__question" "$__hint")" __reply || true
  __reply="${__reply:-$__default}"
  case "$__reply" in
    y|Y|yes|Yes) printf -v "$__var" 'y' ;;
    *) printf -v "$__var" 'n' ;;
  esac
}

# choose VAR "question" default_index "opt1" "opt2" ...
choose() {
  local __var="$1" __question="$2" __default_idx="$3"; shift 3
  local __opts=("$@") __i __reply
  if [ "$ASSUME_YES" -eq 1 ]; then
    printf -v "$__var" '%s' "${__opts[$((__default_idx-1))]}"
    return
  fi
  say "$__question"
  for __i in "${!__opts[@]}"; do
    printf '    %d) %s%s\n' "$((__i+1))" "${__opts[$__i]}" "$([ $((__i+1)) -eq "$__default_idx" ] && echo '  (default)' || echo '')"
  done
  read -r -p "  Choice [${__default_idx}]: " __reply || true
  __reply="${__reply:-$__default_idx}"
  [[ "$__reply" =~ ^[0-9]+$ ]] && [ "$__reply" -ge 1 ] && [ "$__reply" -le "${#__opts[@]}" ] || __reply="$__default_idx"
  printf -v "$__var" '%s' "${__opts[$((__reply-1))]}"
}

gen_secret() {
  # URL/shell-safe random secret, no characters that break a .env value or a
  # mongodb:// URI (no '/', '+', '=', ':', '@').
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "${1:-24}"
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "${2:-48}"
  fi
}

mask() {
  # bash-3.2 safe (macOS ships 3.2): no negative substring offsets.
  local v="$1" n=${#1} tail
  [ "$n" -le 8 ] && { printf '********'; return; }
  tail="${v:$((n-4))}"
  printf '%s…%s (%d chars)' "${v:0:4}" "$tail" "$n"
}

# ----------------------------------------------------------------------------
# 0. Prerequisites
# ----------------------------------------------------------------------------
say "${BOLD}DAVE installer${NC}"
say "Sets up .env and (optionally) starts DAVE via docker compose."

step "Checking prerequisites"
command -v docker >/dev/null 2>&1 || die "docker not found. Install Docker first: https://docs.docker.com/get-docker/"
ok "docker found ($(docker --version))"
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  die "docker compose (v2 plugin) or docker-compose not found."
fi
ok "$COMPOSE found"

# ----------------------------------------------------------------------------
# 1. Existing .env handling
#
# No associative arrays here on purpose - macOS ships bash 3.2 (pre-4.0,
# no `declare -A`) as /bin/bash, and this script needs to run there unmodified.
# Sourcing the existing .env just populates ordinary shell variables, which
# every later `VAR="${VAR:-default}"` picks up as its own default for free.
# ----------------------------------------------------------------------------
if [ -f .env ]; then
  step "Existing .env found"
  KEEP=n
  ask_yn KEEP "  Reuse its values as defaults for the prompts below?" y
  if [ "$KEEP" = y ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
    ok "Loaded existing .env values"
  fi
fi

# ----------------------------------------------------------------------------
# 2. Deployment mode
# ----------------------------------------------------------------------------
step "Deployment mode"
info "development : uses docker-compose-dev.yml - hot-reloads the UI, more"
info "              generous Elasticsearch memory. Best for a first run or a"
info "              workstation."
info "production  : uses docker-compose.yml. Leaner, no hot reload. qavectorizer"
info "              also hard-requires an NVIDIA GPU in this file (a fixed"
info "              'deploy: reservations: devices' block), unless this"
info "              installer strips it for you below."
info ""
info "Neither file starts an LLM/text-generation service - you'll be asked"
info "below to point DAVE at one you already have running."
MODE=development
choose MODE "Which compose file do you want to set up?" 1 development production

if [ "$MODE" = development ]; then
  COMPOSE_FILE=docker-compose-dev.yml
else
  COMPOSE_FILE=docker-compose.yml
fi
ok "Using $COMPOSE_FILE"

# ----------------------------------------------------------------------------
# 3. GPU
# ----------------------------------------------------------------------------
step "Hardware"
GPU_DEFAULT=n
command -v nvidia-smi >/dev/null 2>&1 && GPU_DEFAULT=y
GPU=n
ask_yn GPU "  Do you have an NVIDIA GPU (with the NVIDIA Container Toolkit installed) for embeddings inference?" "$GPU_DEFAULT"
if [ "$GPU" = y ]; then
  SENTENCE_TRANSFORMER_DEVICE=cuda
  ok "Will use GPU (cuda)"
else
  SENTENCE_TRANSFORMER_DEVICE=cpu
  warn "Will use CPU (slower embeddings)"
fi

STRIP_GPU_RESERVATION=n
if [ "$MODE" = production ] && [ "$GPU" = n ]; then
  warn "docker-compose.yml hard-codes a GPU reservation for qavectorizer."
  warn "Without it, 'docker compose up' will fail to start that service on a"
  warn "machine with no GPU."
  ask_yn STRIP_GPU_RESERVATION "  Generate a docker-compose.override.yml that removes that GPU requirement?" y
fi

# ----------------------------------------------------------------------------
# 4. Public address
# ----------------------------------------------------------------------------
step "Public address"
info "Use 127.0.0.1 for local-only access, or a real hostname/domain if other"
info "people need to reach this instance."
HOST_NAME="${HOST_NAME:-127.0.0.1}"
ask HOST_NAME "  Hostname or IP DAVE will be reached at" "$HOST_NAME"
LISTEN_UI="${LISTEN_UI:-3000}"
ask LISTEN_UI "  Port to expose the UI on" "$LISTEN_UI"
NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/dave}"
ask NEXT_PUBLIC_BASE_PATH "  Base path (URL prefix)" "$NEXT_PUBLIC_BASE_PATH"
SCHEME=http
if [ "$HOST_NAME" != "127.0.0.1" ] && [ "$HOST_NAME" != "localhost" ]; then
  USE_HTTPS=n
  ask_yn USE_HTTPS "  Is this address served over HTTPS (e.g. behind a reverse proxy)?" n
  [ "$USE_HTTPS" = y ] && SCHEME=https
fi
NEXT_PUBLIC_FULL_PATH="${SCHEME}://${HOST_NAME}:${LISTEN_UI}${NEXT_PUBLIC_BASE_PATH}"
NEXTAUTH_URL="${NEXT_PUBLIC_FULL_PATH}/api/auth"
NEXTAUTH_URL_INTERNAL="http://localhost:${LISTEN_UI}"
ok "App will be reachable at $NEXT_PUBLIC_FULL_PATH"

# ----------------------------------------------------------------------------
# 5. Authentication (Keycloak is the only login provider in this codebase -
#    USE_AUTH just turns login on/off entirely)
# ----------------------------------------------------------------------------
step "Authentication"
info "DAVE's login is backed by Keycloak SSO. Turning this off makes the app"
info "fully open (no login at all) - fine for a local demo, not for anything"
info "shared."
USE_AUTH_DEFAULT=y
[ "${USE_AUTH:-true}" = "false" ] && USE_AUTH_DEFAULT=n
USE_AUTH=y
ask_yn USE_AUTH "  Require login (Keycloak)?" "$USE_AUTH_DEFAULT"
[ "$USE_AUTH" = y ] && USE_AUTH=true || USE_AUTH=false

KEYCLOAK_ID="${KEYCLOAK_ID:-dave_client}"
KEYCLOAK_SECRET="${KEYCLOAK_SECRET:-}"
KEYCLOAK_HOSTNAME="$HOST_NAME"
KEYCLOAK_ISSUER="http://keycloak:8080/realms/DAVE"
NEED_KEYCLOAK_SETUP=n
if [ "$USE_AUTH" = true ]; then
  ask KEYCLOAK_ID "  Keycloak client ID" "$KEYCLOAK_ID"
  EXISTING_SECRET="${KEYCLOAK_SECRET:-}"
  if [ -n "$EXISTING_SECRET" ]; then
    KEYCLOAK_SECRET="$EXISTING_SECRET"
    ok "Reusing existing KEYCLOAK_SECRET"
  else
    KEYCLOAK_SECRET="REPLACE_ME_after_keycloak_setup"
    NEED_KEYCLOAK_SETUP=y
    warn "No Keycloak client secret yet - that can only be obtained from the"
    warn "Keycloak admin console after DAVE is running. A placeholder will be"
    warn "written; see docs/KEYCLOAK_SETUP.md, then update KEYCLOAK_SECRET and"
    warn "run: $COMPOSE -f $COMPOSE_FILE restart ui"
  fi
fi

# ----------------------------------------------------------------------------
# 6. Elasticsearch index
# ----------------------------------------------------------------------------
step "Search index"
ELASTIC_INDEX="${ELASTIC_INDEX:-dave}"
ask ELASTIC_INDEX "  Elasticsearch index name" "$ELASTIC_INDEX"

# ----------------------------------------------------------------------------
# 7. Embedding model
# ----------------------------------------------------------------------------
step "Embedding model"
info "Default is multilingual. Use an English-only model if you don't need"
info "other languages and want lower memory use."
SENTENCE_TRANSFORMER_EMBEDDING_MODEL="${SENTENCE_TRANSFORMER_EMBEDDING_MODEL:-sentence-transformers/paraphrase-multilingual-mpnet-base-v2}"
ask SENTENCE_TRANSFORMER_EMBEDDING_MODEL "  Sentence-transformer model" "$SENTENCE_TRANSFORMER_EMBEDDING_MODEL"

# ----------------------------------------------------------------------------
# 8. LLM (address/key/name of an LLM you already run - this installer does
#    not start or manage an LLM/text-generation service itself)
# ----------------------------------------------------------------------------
step "Language model (LLM)"
info "DAVE does not run an LLM service for you - point it at one you already"
info "have (OpenAI-compatible API). Leave blank to configure this later."
API_LLM="${API_LLM:-}"
ask API_LLM "  LLM API base URL (e.g. http://host:port/v1)" "$API_LLM"
TEXT_GENERATION_KEY="${TEXT_GENERATION_KEY:-}"
ask TEXT_GENERATION_KEY "  LLM API key (blank if none required)" "$TEXT_GENERATION_KEY"
MODEL_NAME="${MODEL_NAME:-default-model}"
ask MODEL_NAME "  Model name" "$MODEL_NAME"
TEXT_GENERATION_ADDR="$API_LLM"
TEXT_GENERATION="$API_LLM"
LLM_NAME="$MODEL_NAME"
LLM_KEY="$TEXT_GENERATION_KEY"

# ----------------------------------------------------------------------------
# 9. Annotation / NER services (optional, external)
# ----------------------------------------------------------------------------
step "Annotation / entity-linking services (optional)"
info "External NER/entity-linking/anonymization endpoints. Leave unset unless"
info "you already run these."
CONFIGURE_ANNOTATION=n
ask_yn CONFIGURE_ANNOTATION "  Configure them now?" n
ANONYMIZATION_ENDPOINT="${ANONYMIZATION_ENDPOINT:-}"
ANNOTATION_SPACYNER_URL="${ANNOTATION_SPACYNER_URL:-}"
ANNOTATION_BLINK_URL="${ANNOTATION_BLINK_URL:-}"
ANNOTATION_INDEXER_URL="${ANNOTATION_INDEXER_URL:-}"
ANNOTATION_NILPREDICTION_URL="${ANNOTATION_NILPREDICTION_URL:-}"
ANNOTATION_NILCLUSTER_URL="${ANNOTATION_NILCLUSTER_URL:-}"
ANNOTATION_CONSOLIDATION_URL="${ANNOTATION_CONSOLIDATION_URL:-}"
if [ "$CONFIGURE_ANNOTATION" = y ]; then
  ask ANONYMIZATION_ENDPOINT "  Anonymization endpoint" "$ANONYMIZATION_ENDPOINT"
  ask ANNOTATION_SPACYNER_URL "  SpaCy NER URL" "$ANNOTATION_SPACYNER_URL"
  ask ANNOTATION_BLINK_URL "  BLINK entity-linking URL" "$ANNOTATION_BLINK_URL"
  ask ANNOTATION_INDEXER_URL "  Annotation indexer URL" "$ANNOTATION_INDEXER_URL"
  ask ANNOTATION_NILPREDICTION_URL "  NIL prediction URL" "$ANNOTATION_NILPREDICTION_URL"
  ask ANNOTATION_NILCLUSTER_URL "  NIL clustering URL" "$ANNOTATION_NILCLUSTER_URL"
  ask ANNOTATION_CONSOLIDATION_URL "  Consolidation URL" "$ANNOTATION_CONSOLIDATION_URL"
fi

# ----------------------------------------------------------------------------
# 10. Secrets (generated, not asked)
# ----------------------------------------------------------------------------
step "Generating secrets"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$(gen_secret 32)}"
MONGO_ROOT_PASSWORD="${MONGO_ROOT_PASSWORD:-$(gen_secret 24)}"
MONGO_PASSWORD="${MONGO_PASSWORD:-$(gen_secret 24)}"
JWT_SECRET="${JWT_SECRET:-$(gen_secret 32)}"
API_PASSWORD="${API_PASSWORD:-$(gen_secret 16)}"
KEYCLOAK_DB_PASSWORD="${KEYCLOAK_DB_PASSWORD:-$(gen_secret 16)}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-$(gen_secret 16)}"
ok "Secrets ready"

# ----------------------------------------------------------------------------
# 11. Fixed / standard defaults (never asked - match docker-compose.yml)
# ----------------------------------------------------------------------------
RESTART_POLICY=unless-stopped
VARIANT=default
HOST=0.0.0.0
ACCESS_USERNAME=admin
ACCESS_PASSWORD=$(gen_secret 12)   # unused by current frontend code; kept for legacy compose args
API_USERNAME=admin
API_BASE_URI="http://documents:3001/api"
DOCS_PORT=3001
KEYCLOAK_ADMIN=admin
HOST_BASE_URL="http://0.0.0.0"
INDEXER_SERVER_PORT=7863
QAVECTORIZER_ADDR=7863
CHROMA_PORT=8000
ELASTIC_HOST=es
ELASTIC_PORT=9200
API_INDEXER="http://qavectorizer:7863"
OGG2NAME_INDEX="${ELASTIC_INDEX}_ogg2name"
ANNOTATION_PIPELINE_PORT=8002
KEYCLOAK_PORT=8080
MONGO="mongodb://root:${MONGO_ROOT_PASSWORD}@mongo:27017/${ELASTIC_INDEX}?authSource=admin"
# API_LLM, TEXT_GENERATION(_ADDR), TEXT_GENERATION_KEY, MODEL_NAME, LLM_NAME
# and LLM_KEY were already set in the LLM step above.

# ----------------------------------------------------------------------------
# 12. Summary
# ----------------------------------------------------------------------------
step "Summary - review before anything is written"
say ""
say "${BOLD}Compose file:${NC}      $COMPOSE_FILE"
say "${BOLD}App URL:${NC}           $NEXT_PUBLIC_FULL_PATH"
say "${BOLD}GPU:${NC}               $([ "$GPU" = y ] && echo "yes (cuda)" || echo "no (cpu)")"
[ "$STRIP_GPU_RESERVATION" = y ] && say "                     -> docker-compose.override.yml will drop the GPU requirement"
say "${BOLD}Login required:${NC}    $USE_AUTH"
[ "$USE_AUTH" = true ] && say "  Keycloak client ID:  $KEYCLOAK_ID"
[ "$NEED_KEYCLOAK_SETUP" = y ] && say "  ${YELLOW}Keycloak secret:     placeholder - must be set after first run${NC}"
say "${BOLD}Elasticsearch index:${NC} $ELASTIC_INDEX"
say "${BOLD}Embedding model:${NC}   $SENTENCE_TRANSFORMER_EMBEDDING_MODEL"
say "${BOLD}LLM address:${NC}       $([ -n "$API_LLM" ] && echo "$API_LLM" || echo "(not set)")"
say "${BOLD}LLM model name:${NC}    $MODEL_NAME"
say "${BOLD}LLM API key:${NC}       $([ -n "$TEXT_GENERATION_KEY" ] && mask "$TEXT_GENERATION_KEY" || echo "(none)")"
say ""
say "${BOLD}Generated secrets (masked):${NC}"
say "  NEXTAUTH_SECRET          $(mask "$NEXTAUTH_SECRET")"
say "  MONGO_ROOT_PASSWORD      $(mask "$MONGO_ROOT_PASSWORD")"
say "  MONGO_PASSWORD           $(mask "$MONGO_PASSWORD")"
say "  JWT_SECRET               $(mask "$JWT_SECRET")"
say "  API_PASSWORD             $(mask "$API_PASSWORD")"
[ "$USE_AUTH" = true ] && say "  KEYCLOAK_DB_PASSWORD     $(mask "$KEYCLOAK_DB_PASSWORD")"
[ "$USE_AUTH" = true ] && say "  KEYCLOAK_ADMIN_PASSWORD  $(mask "$KEYCLOAK_ADMIN_PASSWORD")"
say ""
say "${BOLD}Everything else${NC} (ports, internal service URLs, restart policy, etc.)"
say "is set to DAVE's standard defaults, same as .env.sample."
say ""

PROCEED=n
ask_yn PROCEED "Write this configuration to .env?" y
[ "$PROCEED" = y ] || die "Aborted - nothing was written."

# ----------------------------------------------------------------------------
# 13. Write .env
# ----------------------------------------------------------------------------
if [ -f .env ]; then
  BACKUP=".env.bak.$(date +%Y%m%d%H%M%S)"
  cp .env "$BACKUP"
  ok "Backed up existing .env to $BACKUP"
fi

cat > .env <<EOF
# Generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# UI
ACCESS_USERNAME=$ACCESS_USERNAME
ACCESS_PASSWORD=$ACCESS_PASSWORD
API_BASE_URI=$API_BASE_URI
API_USERNAME=$API_USERNAME
API_PASSWORD=$API_PASSWORD
USE_AUTH=$USE_AUTH
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
NEXTAUTH_URL=$NEXTAUTH_URL
NEXTAUTH_URL_INTERNAL=$NEXTAUTH_URL_INTERNAL
NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
NEXT_PUBLIC_FULL_PATH=$NEXT_PUBLIC_FULL_PATH
API_LLM=$API_LLM
LLM_NAME=$LLM_NAME
LLM_KEY=$LLM_KEY
API_INDEXER=$API_INDEXER
VARIANT=$VARIANT
HOST=$HOST
LISTEN_UI=$LISTEN_UI
ELASTIC_INDEX=$ELASTIC_INDEX
NEXT_PUBLIC_ELASTIC_INDEX=$ELASTIC_INDEX

# Keycloak
KEYCLOAK_ID=$KEYCLOAK_ID
KEYCLOAK_SECRET=$KEYCLOAK_SECRET
KEYCLOAK_ISSUER=$KEYCLOAK_ISSUER
KEYCLOAK_ADMIN=$KEYCLOAK_ADMIN
KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD
KEYCLOAK_DB_PASSWORD=$KEYCLOAK_DB_PASSWORD
KEYCLOAK_HOSTNAME=$KEYCLOAK_HOSTNAME
KEYCLOAK_PORT=$KEYCLOAK_PORT

# General
RESTART_POLICY=$RESTART_POLICY

# MongoDB
MONGO_ROOT_PASSWORD=$MONGO_ROOT_PASSWORD
MONGO_PASSWORD=$MONGO_PASSWORD
MONGO=$MONGO

# Documents
DOCS_PORT=$DOCS_PORT
JWT_SECRET=$JWT_SECRET

# Text Generation (no service started/managed by this installer - see above)
TEXT_GENERATION=$TEXT_GENERATION
TEXT_GENERATION_ADDR=$TEXT_GENERATION_ADDR
TEXT_GENERATION_KEY=$TEXT_GENERATION_KEY
MODEL_NAME=$MODEL_NAME

# QA Vectorizer
HOST_BASE_URL=$HOST_BASE_URL
INDEXER_SERVER_PORT=$INDEXER_SERVER_PORT
QAVECTORIZER_ADDR=$QAVECTORIZER_ADDR
CHROMA_PORT=$CHROMA_PORT
ELASTIC_HOST=$ELASTIC_HOST
ELASTIC_PORT=$ELASTIC_PORT
SENTENCE_TRANSFORMER_EMBEDDING_MODEL=$SENTENCE_TRANSFORMER_EMBEDDING_MODEL
SENTENCE_TRANSFORMER_DEVICE=$SENTENCE_TRANSFORMER_DEVICE
OGG2NAME_INDEX=$OGG2NAME_INDEX

# Annotation pipeline
ANNOTATION_PIPELINE_PORT=$ANNOTATION_PIPELINE_PORT

# Annotation services (optional)
ANONYMIZATION_ENDPOINT=$ANONYMIZATION_ENDPOINT
ANNOTATION_SPACYNER_URL=$ANNOTATION_SPACYNER_URL
ANNOTATION_BLINK_URL=$ANNOTATION_BLINK_URL
ANNOTATION_INDEXER_URL=$ANNOTATION_INDEXER_URL
ANNOTATION_NILPREDICTION_URL=$ANNOTATION_NILPREDICTION_URL
ANNOTATION_NILCLUSTER_URL=$ANNOTATION_NILCLUSTER_URL
ANNOTATION_CONSOLIDATION_URL=$ANNOTATION_CONSOLIDATION_URL
EOF
chmod 600 .env
ok "Wrote .env (permissions set to 600)"

# ----------------------------------------------------------------------------
# 14. GPU override file
# ----------------------------------------------------------------------------
if [ "$STRIP_GPU_RESERVATION" = y ]; then
  cat > docker-compose.override.yml <<'EOF'
# Generated by install.sh: drops the hard-coded NVIDIA GPU reservation that
# docker-compose.yml requests for qavectorizer, for CPU-only hosts.
# Delete this file if you later add a GPU and want the reservation back.
services:
  qavectorizer:
    deploy: {}
EOF
  ok "Wrote docker-compose.override.yml (removes qavectorizer's GPU requirement)"
fi

# ----------------------------------------------------------------------------
# 15. Validate
# ----------------------------------------------------------------------------
if [ -x ./validate_env.sh ]; then
  step "Running validate_env.sh"
  ./validate_env.sh || warn "validate_env.sh reported issues - review above."
fi

# ----------------------------------------------------------------------------
# 16. Optionally build & start
# ----------------------------------------------------------------------------
step "Start DAVE now?"
START=n
ask_yn START "Run '$COMPOSE -f $COMPOSE_FILE build && $COMPOSE -f $COMPOSE_FILE up -d' now?" y
if [ "$START" = y ]; then
  $COMPOSE -f "$COMPOSE_FILE" build
  $COMPOSE -f "$COMPOSE_FILE" up -d
  ok "DAVE is starting. Check status with: $COMPOSE -f $COMPOSE_FILE ps"
else
  info "When ready, run: $COMPOSE -f $COMPOSE_FILE build && $COMPOSE -f $COMPOSE_FILE up -d"
fi

# ----------------------------------------------------------------------------
# 17. Next steps
# ----------------------------------------------------------------------------
step "Next steps"
say "  App URL:        $NEXT_PUBLIC_FULL_PATH"
if [ "$NEED_KEYCLOAK_SETUP" = y ]; then
  say "  ${YELLOW}Finish Keycloak setup:${NC} docs/KEYCLOAK_SETUP.md, then set KEYCLOAK_SECRET"
  say "                  in .env and run: $COMPOSE -f $COMPOSE_FILE restart ui"
  say "  Keycloak admin console: http://${KEYCLOAK_HOSTNAME}:${KEYCLOAK_PORT} (admin / $(mask "$KEYCLOAK_ADMIN_PASSWORD"), full password in .env)"
fi
say "  Logs:           $COMPOSE -f $COMPOSE_FILE logs -f <service>"
say "  Stop:           $COMPOSE -f $COMPOSE_FILE down"
ok "Done."
