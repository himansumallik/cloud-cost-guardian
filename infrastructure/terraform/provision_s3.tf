# Auto-generated from Dashboard at 2026-11-10T17:33:58.362Z
resource "aws_s3_bucket" "dashboard_bucket" {
  bucket        = var.resource_name
  force_destroy = true
  tags = {
    Name      = var.resource_name
    ManagedBy = "TerraformDashboard"
  }
}
