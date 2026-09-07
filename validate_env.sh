#!/bin/bash

# DAVE Environment Variable Validation Script
# This script checks if your .env file has all required variables set

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "DAVE Environment Validation Script"
echo "======================================"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found!${NC}"
    echo ""
    echo "Please create .env file from .env.sample:"
    echo "  cp .env.sample .env"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ .env file found${NC}"
echo ""

# Required variables that MUST be set
REQUIRED_VARS=(
    "NEXTAUTH_SECRET"
    "NEXTAUTH_URL"
    "ACCESS_USERNAME"
    "ACCESS_PASSWORD"
    "MONGO_ROOT_PASSWORD"
    "MONGO_PASSWORD"
    "MONGO"
)

# Important variables that should be set
IMPORTANT_VARS=(
    "API_BASE_URI"
    "NEXT_PUBLIC_BASE_PATH"
    "NEXT_PUBLIC_FULL_PATH"
    "API_LLM"
    "API_INDEXER"
    "LISTEN_UI"
    "ELASTIC_INDEX"
    "RESTART_POLICY"
    "TEXT_GENERATION_ADDR"
    "SENTENCE_TRANSFORMER_EMBEDDING_MODEL"
)

# Load .env file
set -a
source .env
set +a

echo "Checking REQUIRED variables..."
echo "------------------------------"

ERRORS=0
WARNINGS=0

# Check required variables
for var in "${REQUIRED_VARS[@]}"; do
    value="${!var}"
    if [ -z "$value" ]; then
        echo -e "${RED}✗ $var is NOT SET${NC}"
        ERRORS=$((ERRORS + 1))
    elif [ "$value" = "change_this_to_random_secret_minimum_32_characters" ] || \
         [ "$value" = "change_this_mongo_root_password" ] || \
         [ "$value" = "change_this_mongo_password" ] || \
         [ "$value" = "your_nextauth_secret" ]; then
        echo -e "${YELLOW}⚠ $var is using default/placeholder value${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓ $var is set${NC}"
    fi
done

echo ""
echo "Checking IMPORTANT variables..."
echo "------------------------------"

for var in "${IMPORTANT_VARS[@]}"; do
    value="${!var}"
    if [ -z "$value" ]; then
        echo -e "${YELLOW}⚠ $var is NOT SET (may use defaults)${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓ $var is set${NC}"
    fi
done

echo ""
echo "Specific Validations..."
echo "------------------------------"

# Check NEXTAUTH_SECRET length
if [ -n "$NEXTAUTH_SECRET" ]; then
    SECRET_LENGTH=${#NEXTAUTH_SECRET}
    if [ $SECRET_LENGTH -lt 32 ]; then
        echo -e "${RED}✗ NEXTAUTH_SECRET is too short ($SECRET_LENGTH chars). Should be at least 32 characters${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✓ NEXTAUTH_SECRET length is sufficient ($SECRET_LENGTH chars)${NC}"
    fi
fi

# Check NEXTAUTH_URL format
if [ -n "$NEXTAUTH_URL" ]; then
    if [[ $NEXTAUTH_URL == *"/api/auth" ]]; then
        echo -e "${GREEN}✓ NEXTAUTH_URL has correct format${NC}"
    else
        echo -e "${RED}✗ NEXTAUTH_URL should end with /api/auth${NC}"
        ERRORS=$((ERRORS + 1))
    fi

    # Warn about localhost vs 127.0.0.1
    if [[ $NEXTAUTH_URL == *"localhost"* ]]; then
        echo -e "${YELLOW}⚠ NEXTAUTH_URL uses 'localhost'. Consider using '127.0.0.1' to avoid DNS issues${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

# Check MONGO connection string includes password
if [ -n "$MONGO" ]; then
    if [[ $MONGO == *"change_this_mongo_root_password"* ]]; then
        echo -e "${YELLOW}⚠ MONGO connection string uses default password. Update it to match MONGO_ROOT_PASSWORD${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✓ MONGO connection string appears updated${NC}"
    fi
fi

# Summary
echo ""
echo "======================================"
echo "Validation Summary"
echo "======================================"

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}✗ Found $ERRORS critical error(s)${NC}"
    echo ""
    echo "Please fix the errors above before running docker compose."
    echo ""
    exit 1
fi

if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠ Found $WARNINGS warning(s)${NC}"
    echo ""
    echo "Your .env file will work, but you should update the warnings above."
    echo "Especially change default passwords for production use!"
    echo ""
fi

echo -e "${GREEN}✓ All required variables are set!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review any warnings above"
echo "  2. Run: docker compose build"
echo "  3. Run: docker compose up -d"
echo ""
