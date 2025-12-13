variable "environment" {
  description = "Environment name (e.g., production, staging, development)"
  type        = string
}

variable "project_id" {
  description = "Cloud provider project/account identifier"
  type        = string
}

variable "region" {
  description = "Primary region for service deployment"
  type        = string
}

variable "service_name" {
  description = "Name of the auth service"
  type        = string
  default     = "af-auth"
}

variable "container_image" {
  description = "Full container image URI (e.g., gcr.io/project/image:tag)"
  type        = string
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

variable "cpu_limit" {
  description = "CPU limit for container (provider-specific format)"
  type        = string
  default     = "1000m"
}

variable "memory_limit" {
  description = "Memory limit for container (provider-specific format)"
  type        = string
  default     = "512Mi"
}

variable "min_instances" {
  description = "Minimum number of instances to keep running"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances to scale to"
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

variable "database_connection_name" {
  description = "Database connection identifier (for Cloud SQL proxy)"
  type        = string
}

variable "redis_enabled" {
  description = "Whether Redis is enabled"
  type        = bool
  default     = true
}

variable "redis_host" {
  description = "Redis host address"
  type        = string
  default     = ""
}

variable "redis_port" {
  description = "Redis port"
  type        = number
  default     = 6379
}

variable "vpc_connector_id" {
  description = "VPC connector identifier for private networking"
  type        = string
  default     = null
}

variable "environment_variables" {
  description = "Environment variables to set in the container"
  type        = map(string)
  default     = {}
}

variable "secret_environment_variables" {
  description = "Secret environment variables (maps to secret manager keys)"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Common tags/labels to apply to service resources"
  type        = map(string)
  default     = {}
}
