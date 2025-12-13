terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  common_tags = {
    environment = var.environment
    managed_by  = "terraform"
    service     = "af-auth"
  }
}

# VPC and Networking
resource "google_compute_network" "vpc" {
  count                   = var.enable_private_networking ? 1 : 0
  name                    = "af-auth-${var.environment}-network"
  auto_create_subnetworks = false
  project                 = var.project_id
}

resource "google_compute_subnetwork" "private_subnet" {
  count         = var.enable_private_networking ? 1 : 0
  name          = "af-auth-${var.environment}-subnet"
  ip_cidr_range = var.vpc_cidr
  region        = var.region
  network       = google_compute_network.vpc[0].id
  project       = var.project_id
}

# VPC Access Connector for Cloud Run
resource "google_vpc_access_connector" "connector" {
  count         = var.enable_private_networking ? 1 : 0
  name          = "af-auth-${var.environment}-vpc-connector"
  region        = var.region
  network       = google_compute_network.vpc[0].name
  ip_cidr_range = var.vpc_connector_cidr
  project       = var.project_id
}

# Cloud SQL Instance
resource "google_sql_database_instance" "postgres" {
  name             = "af-auth-db-${var.environment}"
  database_version = var.database_version
  region           = var.region
  project          = var.project_id

  settings {
    tier              = var.database_tier
    availability_type = var.high_availability ? "REGIONAL" : "ZONAL"

    backup_configuration {
      enabled                        = var.backup_enabled
      point_in_time_recovery_enabled = var.backup_enabled
      start_time                     = "03:00"
      transaction_log_retention_days = var.backup_retention_days
      backup_retention_settings {
        retained_backups = var.backup_retention_days
      }
    }

    ip_configuration {
      ipv4_enabled    = var.enable_private_networking ? false : true
      private_network = var.enable_private_networking ? google_compute_network.vpc[0].id : null
      require_ssl     = var.enable_ssl
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
    }
  }

  deletion_protection = var.environment == "production" ? true : false
}

resource "google_sql_database" "database" {
  name     = var.database_name
  instance = google_sql_database_instance.postgres.name
  project  = var.project_id
}

resource "google_sql_user" "user" {
  name     = var.database_user
  instance = google_sql_database_instance.postgres.name
  # Database password retrieved from Secret Manager
  # Ensure the secret exists before applying (create with: gcloud secrets create database-password)
  # See SECURITY.md for detailed implementation patterns and migration guide.
  password = data.google_secret_manager_secret_version.db_password.secret_data
  project  = var.project_id
}

# Cloud Memorystore for Redis
resource "google_redis_instance" "cache" {
  count          = var.enable_redis ? 1 : 0
  name           = "af-auth-redis-${var.environment}"
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  region         = var.region
  redis_version  = var.redis_version
  project        = var.project_id

  authorized_network = var.enable_private_networking ? google_compute_network.vpc[0].id : null

  display_name = "AF Auth Redis - ${var.environment}"

  labels = local.common_tags
}

# Data source to get the database password from Secret Manager
data "google_secret_manager_secret_version" "db_password" {
  secret  = var.database_password_secret
  project = var.project_id
}

# Service Account for Cloud Run
resource "google_service_account" "cloud_run" {
  account_id   = "af-auth-${var.environment}-run"
  display_name = "AF Auth Cloud Run Service Account - ${var.environment}"
  project      = var.project_id
}

# IAM binding for Cloud SQL Client
resource "google_project_iam_member" "cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# IAM binding for Secret Manager Secret Accessor (per-secret)
resource "google_secret_manager_secret_iam_member" "secret_accessor" {
  for_each  = var.secret_environment_variables
  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# IAM binding for database password secret
resource "google_secret_manager_secret_iam_member" "db_password_accessor" {
  project   = var.project_id
  secret_id = var.database_password_secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Cloud Run Service
resource "google_cloud_run_v2_service" "auth_service" {
  name     = "${var.service_name}-${var.environment}"
  location = var.region
  project  = var.project_id

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = var.enable_private_networking ? google_vpc_access_connector.connector[0].id : null
      egress    = var.enable_private_networking ? "PRIVATE_RANGES_ONLY" : "ALL_TRAFFIC"
    }

    containers {
      image = var.container_image

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
      }

      # Base environment variables
      dynamic "env" {
        for_each = merge(
          var.environment_variables,
          {
            NODE_ENV = var.environment == "production" ? "production" : "development"
            PORT     = tostring(var.container_port)
            # Database connection string with password from Secret Manager
            # Password is retrieved securely via data source rather than passed as variable
            DATABASE_URL = "postgresql://${var.database_user}:${data.google_secret_manager_secret_version.db_password.secret_data}@localhost/${var.database_name}?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"
            REDIS_HOST   = var.enable_redis ? google_redis_instance.cache[0].host : ""
            REDIS_PORT   = var.enable_redis ? tostring(google_redis_instance.cache[0].port) : ""
          }
        )
        content {
          name  = env.key
          value = env.value
        }
      }

      # Secret environment variables from Secret Manager
      dynamic "env" {
        for_each = var.secret_environment_variables
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
    }

    timeout = "${var.timeout_seconds}s"
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  labels = local.common_tags
}

# IAM policy for public access (if enabled)
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  count    = var.allow_public_access ? 1 : 0
  project  = var.project_id
  location = google_cloud_run_v2_service.auth_service.location
  name     = google_cloud_run_v2_service.auth_service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
