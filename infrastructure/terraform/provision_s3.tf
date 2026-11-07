# Auto-generated from Dashboard by Himansu Mallik (RA2311003012367) at 2026-11-06T16:08:51.884Z
resource "aws_s3_bucket" "dashboard_bucket" {
  bucket        = var.resource_name
  force_destroy = true
  tags = {
    Name      = var.resource_name
    ManagedBy = "TerraformDashboard"
  }
}
