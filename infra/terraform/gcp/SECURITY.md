# Security Considerations for GCP Terraform Deployment

## Database Password Security

### ⚠️ Current Implementation

The current implementation accepts database passwords via the `database_password` variable for simplicity and development use. However, this approach has security risks:

1. **State File Exposure**: Password stored in Terraform state file (even if encrypted)
2. **Environment Variable Exposure**: Password embedded in DATABASE_URL environment variable
3. **Log Exposure**: Password may appear in Cloud Run logs or Terraform output
4. **Version Control Risk**: If terraform.tfvars is accidentally committed

### ✅ Recommended Production Pattern

For production deployments, use one of these secure alternatives:

#### Option 1: Cloud SQL IAM Authentication (Most Secure)

Use Cloud SQL built-in IAM authentication to eliminate passwords entirely:

```hcl
# In main.tf, modify the database user:
resource "google_sql_user" "user" {
  name     = google_service_account.cloud_run.email
  instance = google_sql_database_instance.postgres.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
  project  = var.project_id
}

# Modify DATABASE_URL to use IAM auth:
DATABASE_URL = "postgresql://${google_service_account.cloud_run.email}@localhost/${var.database_name}?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"
```

Benefits:
- No passwords to manage
- Automatic rotation via service account
- Audit trail via Cloud Logging

#### Option 2: Secret Manager for Database URL

Store the complete DATABASE_URL in Secret Manager:

```hcl
# Create a secret for the database URL
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
  replication {
    automatic = true
  }
}

# Store the connection string (create manually or via another process)
# gcloud secrets versions add database-url --data-file=- < <(echo "postgresql://...")

# In Cloud Run, reference from Secret Manager
dynamic "env" {
  for_each = merge(
    var.secret_environment_variables,
    {
      DATABASE_URL = "database-url"  # Add to secret_environment_variables
    }
  )
  content {
    name = env.key
    value_source {
      secret_key_ref {
        secret  = env.value
        version = "latest"
      }
    }
  }
}
```

Benefits:
- Password not in Terraform state
- Centralized secret management
- Rotation without infrastructure changes

#### Option 3: Data Source from Secret Manager

Retrieve password from Secret Manager at plan time:

```hcl
# Add data source to retrieve password
data "google_secret_manager_secret_version" "db_password" {
  secret  = "database-password"
  version = "latest"
}

# Use in database user creation
resource "google_sql_user" "user" {
  name     = var.database_user
  instance = google_sql_database_instance.postgres.name
  password = data.google_secret_manager_secret_version.db_password.secret_data
  project  = var.project_id
}
```

Setup:
```bash
# Create secret first
openssl rand -hex 32 | gcloud secrets create database-password --data-file=-
```

Benefits:
- No password in tfvars
- Still stored in state (encrypted at rest)
- Easy rotation process

### Implementation Steps for Production

1. **Choose a Pattern**: Select IAM auth (most secure) or Secret Manager approach
2. **Create Secrets**: Store credentials in Secret Manager before running Terraform
3. **Modify Terraform**: Update main.tf with chosen pattern
4. **Update Variables**: Remove or make database_password optional
5. **Test Thoroughly**: Verify database connectivity after deployment
6. **Document Process**: Update team runbooks with new procedures

### Terraform State Security

Even with secure password handling, protect your Terraform state:

```hcl
# In backend configuration
terraform {
  backend "gcs" {
    bucket = "your-terraform-state-bucket"
    prefix = "terraform/af-auth"
    
    # Enable encryption at rest
    encryption_key = "YOUR_ENCRYPTION_KEY"  # Or use default GCS encryption
  }
}
```

Best practices:
- Enable versioning on state bucket
- Restrict IAM access to state bucket
- Use customer-managed encryption keys (CMEK)
- Enable bucket logging
- Set lifecycle policies for old versions

### Environment Variable Security

Cloud Run environment variables are:
- Encrypted at rest
- Visible to service account
- Logged in Cloud Logging (be careful!)
- Visible in console UI

For sensitive data, prefer Secret Manager references over environment variables:

```hcl
# LESS SECURE: Environment variable
env {
  name  = "API_KEY"
  value = var.api_key
}

# MORE SECURE: Secret Manager reference
env {
  name = "API_KEY"
  value_source {
    secret_key_ref {
      secret  = "api-key"
      version = "latest"
    }
  }
}
```

### IAM and Service Account Security

Current implementation follows least-privilege:
- Service account has only required roles
- Cloud SQL Client (cloudsql.client)
- Secret Manager Secret Accessor (secretmanager.secretAccessor)

Additional hardening:
- Use separate service accounts for different environments
- Enable VPC Service Controls
- Implement organization policies
- Enable audit logging for all IAM changes

### Monitoring and Alerts

Set up alerts for:
- Failed authentication attempts to database
- Unauthorized secret access attempts
- Terraform state file access
- Service account key creation (should be none)

Example alert:
```bash
gcloud logging metrics create failed-db-auth \
  --description="Failed database authentication attempts" \
  --log-filter='resource.type="cloudsql_database"
                severity>=ERROR
                protoPayload.status.message=~"password authentication failed"'
```

### Secret Rotation Procedures

For production systems:

1. **Database Passwords**:
   - Create new password in Secret Manager
   - Update secret version reference
   - Allow old password 24-hour grace period
   - Redeploy services
   - Verify connectivity
   - Delete old password version

2. **Service Account Keys**:
   - Should NOT be used (use IAM authentication)
   - If absolutely necessary, rotate every 90 days

3. **Terraform Rotation**:
   - Update secrets in Secret Manager
   - Run terraform plan to verify no changes needed
   - If DATABASE_URL is stored: Update in Secret Manager
   - Redeploy Cloud Run service

### Compliance Considerations

For regulated industries (HIPAA, PCI-DSS, SOC 2):
- Use IAM authentication for database
- Enable Cloud SQL encryption at rest
- Use VPC for private connectivity
- Enable Cloud Armor for DDoS protection
- Implement network egress controls
- Document all secret access in runbooks

### Development vs Production

**Development**:
- Simple password in tfvars is acceptable
- Focus on functionality over security
- Use separate project from production
- Test rotation procedures

**Production**:
- MUST use IAM auth or Secret Manager
- Enable all security features
- Regular security audits
- Automated secret rotation
- Strict IAM policies
- Comprehensive monitoring

### Migration Path

To migrate existing deployments to secure pattern:

```bash
# 1. Create secrets
gcloud secrets create database-password --data-file=- < <(echo "current_password")

# 2. Update Terraform
# - Modify main.tf with secure pattern
# - Update variables.tf to make database_password optional

# 3. Test in development
terraform plan
terraform apply

# 4. Verify connectivity
gcloud run services proxy af-auth-dev --port=3000
# Test database connection

# 5. Roll out to production with maintenance window
# Follow change management procedures
```

## Additional Resources

- [Cloud SQL IAM Authentication](https://cloud.google.com/sql/docs/postgres/authentication)
- [Secret Manager Best Practices](https://cloud.google.com/secret-manager/docs/best-practices)
- [Cloud Run Security](https://cloud.google.com/run/docs/securing/overview)
- [Terraform Security](https://www.terraform.io/docs/language/state/sensitive-data.html)
