variable "aws_region" {
  description = "AWS region for Cloud Cost Guardian sandbox"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "sandbox"
}

variable "app_instance_type" {
  description = "EC2 instance type for hosting Docker Compose stack"
  type        = string
  default     = "t3.small"
}

variable "enable_waste_simulation" {
  description = "Create intentional idle EC2 and unattached 1GB EBS volume for FinOps testing"
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Email address for the $5 AWS Budget alarm"
  type        = string
  default     = "himansu.ccg@example.com"
}
