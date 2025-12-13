#!/bin/bash
# Terraform Validation Script
# This script validates Terraform configuration without requiring cloud credentials
# Usage: ./validate.sh [module_path]

set -e

echo "=========================================="
echo "Terraform Configuration Validation"
echo "=========================================="
echo ""

# Check if terraform is installed
if ! command -v terraform &> /dev/null; then
    echo "❌ Error: Terraform is not installed"
    echo "   Install from: https://www.terraform.io/downloads"
    exit 1
fi

echo "✓ Terraform version: $(terraform version -json | grep -o '"terraform_version":"[^"]*"' | cut -d'"' -f4)"
echo ""

# Determine what to validate
if [ -n "$1" ]; then
    MODULES=("$1")
else
    # Validate all modules
    MODULES=(
        "modules/network"
        "modules/database"
        "modules/redis"
        "modules/auth-service"
        "gcp"
    )
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Step 1: Format Check"
echo "=========================================="
echo ""

terraform fmt -check -recursive . && echo "✓ All Terraform files are properly formatted" || {
    echo "⚠️  Some files need formatting. Run: terraform fmt -recursive ."
    terraform fmt -recursive .
    echo "✓ Files formatted"
}
echo ""

echo "=========================================="
echo "Step 2: Module Validation"
echo "=========================================="
echo ""

FAILED_MODULES=()
TEMP_FILES=()

# Trap handler to clean up temporary files on exit
cleanup_temp_files() {
    for temp_file in "${TEMP_FILES[@]}"; do
        rm -f "$temp_file" 2>/dev/null
    done
}
trap cleanup_temp_files EXIT INT TERM

for module in "${MODULES[@]}"; do
    echo "Validating: $module"
    echo "----------------------------------------"
    
    cd "$SCRIPT_DIR/$module"
    
    # Create temporary files for output
    INIT_LOG=$(mktemp)
    VALIDATE_LOG=$(mktemp)
    TEMP_FILES+=("$INIT_LOG" "$VALIDATE_LOG")
    
    # Initialize without backend
    if terraform init -backend=false > "$INIT_LOG" 2>&1; then
        echo "  ✓ Initialization successful"
    else
        echo "  ❌ Initialization failed"
        cat "$INIT_LOG"
        FAILED_MODULES+=("$module (init)")
        cd "$SCRIPT_DIR"
        continue
    fi
    
    # Validate configuration
    if terraform validate > "$VALIDATE_LOG" 2>&1; then
        echo "  ✓ Validation successful"
    else
        echo "  ❌ Validation failed"
        cat "$VALIDATE_LOG"
        FAILED_MODULES+=("$module (validate)")
    fi
    
    echo ""
    cd "$SCRIPT_DIR"
done

echo "=========================================="
echo "Step 3: Check .gitignore"
echo "=========================================="
echo ""

# Check that important files are gitignored
GITIGNORE_FILE="$SCRIPT_DIR/../../.gitignore"
if grep -q "terraform.tfstate" "$GITIGNORE_FILE" && \
   grep -q ".terraform/" "$GITIGNORE_FILE" && \
   grep -q "terraform.tfvars" "$GITIGNORE_FILE"; then
    echo "✓ Terraform state and secret files are properly gitignored"
else
    echo "⚠️  Warning: Some Terraform files may not be gitignored"
fi
echo ""

echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""

if [ ${#FAILED_MODULES[@]} -eq 0 ]; then
    echo "✅ All validations passed!"
    echo ""
    echo "Next steps:"
    echo "  1. Copy terraform.tfvars.example to terraform.tfvars"
    echo "  2. Edit terraform.tfvars with your configuration"
    echo "  3. Run: terraform init"
    echo "  4. Run: terraform plan"
    echo "  5. Run: terraform apply"
    exit 0
else
    echo "❌ Validation failed for the following modules:"
    for failed in "${FAILED_MODULES[@]}"; do
        echo "  - $failed"
    done
    exit 1
fi
