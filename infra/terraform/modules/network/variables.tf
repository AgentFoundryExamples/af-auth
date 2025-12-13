variable "environment" {
  description = "Environment name (e.g., production, staging, development)"
  type        = string
}

variable "project_id" {
  description = "Cloud provider project/account identifier"
  type        = string
}

variable "region" {
  description = "Primary region for network resources"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for VPC (provider-specific implementation)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_private_networking" {
  description = "Enable private networking for database and cache services"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Common tags/labels to apply to all resources"
  type        = map(string)
  default     = {}
}
