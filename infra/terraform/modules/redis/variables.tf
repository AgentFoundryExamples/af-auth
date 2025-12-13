variable "environment" {
  description = "Environment name (e.g., production, staging, development)"
  type        = string
}

variable "project_id" {
  description = "Cloud provider project/account identifier"
  type        = string
}

variable "region" {
  description = "Primary region for Redis/cache service"
  type        = string
}

variable "enable_redis" {
  description = "Enable Redis/cache service (set to false for minimal deployments)"
  type        = bool
  default     = true
}

variable "redis_tier" {
  description = "Redis tier/size (provider-specific, e.g., BASIC, STANDARD_HA)"
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

variable "network_id" {
  description = "Network/VPC identifier for private connectivity"
  type        = string
  default     = null
}

variable "high_availability" {
  description = "Enable high availability/replication"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Common tags/labels to apply to Redis resources"
  type        = map(string)
  default     = {}
}
