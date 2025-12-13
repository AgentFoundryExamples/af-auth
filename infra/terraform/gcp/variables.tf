variable "project_id" {
  description = "Google Cloud project ID"
  type        = string
}

variable "region" {
  description = "Google Cloud region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (e.g., production, staging, development)"
  type        = string
  default     = "production"
}

variable "service_name" {
  description = "Name of the auth service"
  type        = string
  default     = "af-auth"
}

variable "container_image" {
  description = "Full container image URI (e.g., gcr.io/project/af-auth:latest)"
  type        = string
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

# Networking
variable "enable_private_networking" {
  description = "Enable private VPC networking"
  type        = bool
  default     = true
}

variable "vpc_cidr" {
  description = "CIDR block for VPC subnet"
  type        = string
  default     = "10.0.0.0/24"
}

# Database Configuration
variable "database_name" {
  description = "Name of the database to create"
  type        = string
  default     = "af_auth"
}

variable "database_user" {
  description = "Database user name"
  type        = string
  default     = "af_auth_user"
}

variable "database_password" {
  description = "Database password - SECURITY WARNING: For production, create a Secret Manager secret and reference via secret_environment_variables instead of passing directly"
  type        = string
  sensitive   = true
}

variable "database_tier" {
  description = "Cloud SQL instance tier (e.g., db-f1-micro, db-g1-small, db-n1-standard-1)"
  type        = string
  default     = "db-f1-micro"
}

variable "database_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "POSTGRES_15"
}

variable "backup_enabled" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 7
}

variable "high_availability" {
  description = "Enable high availability (regional deployment)"
  type        = bool
  default     = false
}

variable "enable_ssl" {
  description = "Require SSL connections to database"
  type        = bool
  default     = true
}

# Redis Configuration
variable "enable_redis" {
  description = "Enable Redis (Cloud Memorystore) - required for multi-instance deployments"
  type        = bool
  default     = true
}

variable "redis_tier" {
  description = "Redis tier (BASIC or STANDARD_HA)"
  type        = string
  default     = "BASIC"
}

variable "redis_memory_size_gb" {
  description = "Memory size in GB for Redis instance"
  type        = number
  default     = 1
}

variable "redis_version" {
  description = "Redis version"
  type        = string
  default     = "REDIS_7_0"
}

# Cloud Run Configuration
variable "cpu_limit" {
  description = "CPU limit for container (e.g., 1000m = 1 CPU)"
  type        = string
  default     = "1000m"
}

variable "memory_limit" {
  description = "Memory limit for container (e.g., 512Mi, 1Gi)"
  type        = string
  default     = "512Mi"
}

variable "min_instances" {
  description = "Minimum number of Cloud Run instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

variable "concurrency" {
  description = "Maximum concurrent requests per instance"
  type        = number
  default     = 80
}

variable "timeout_seconds" {
  description = "Request timeout in seconds"
  type        = number
  default     = 300
}

variable "allow_public_access" {
  description = "Allow unauthenticated public access to the service"
  type        = bool
  default     = true
}

# Environment Variables
variable "environment_variables" {
  description = "Additional environment variables for the service"
  type        = map(string)
  default     = {}
}

variable "secret_environment_variables" {
  description = "Secret environment variables (maps to Secret Manager secret names)"
  type        = map(string)
  default     = {}
}
