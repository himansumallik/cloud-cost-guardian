# Auto-generated from Dashboard at 2026-11-10T17:33:56.585Z
resource "aws_ebs_volume" "dashboard_ebs" {
  availability_zone = "${var.aws_region}a"
  size              = var.volume_size_gb
  type              = "gp3"
  encrypted         = true
  tags = {
    Name      = var.resource_name
    ManagedBy = "TerraformDashboard"
  }
}
