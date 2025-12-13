variable "environment" {
  description = "Environment name (e.g., production, staging, development)"
  type        = string
}

variable "project_id" {
  description = "Cloud provider project/account identifier"
  type        = string
}

variable "region" {
  description = "Primary region for database"
  type        = string
}

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

variable "database_tier" {
  description = "Database instance tier/size (provider-specific)"
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
  description = "Enable high availability/multi-zone deployment"
  type        = bool
  default     = false
}

variable "network_id" {
  description = "Network/VPC identifier for private connectivity"
  type        = string
  default     = null
}

variable "enable_ssl" {
  description = "Require SSL connections"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Common tags/labels to apply to database resources"
  type        = map(string)
  default     = {}
}
