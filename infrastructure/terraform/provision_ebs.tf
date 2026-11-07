# Auto-generated from Dashboard by Himansu Mallik (RA2311003012367) at 2026-11-06T16:16:32.494Z
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
