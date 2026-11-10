# Auto-generated from Dashboard at 2026-11-10T17:34:00.090Z
resource "aws_iam_user" "dashboard_user" {
  name = var.resource_name
}
resource "aws_iam_access_key" "dashboard_key" {
  user = aws_iam_user.dashboard_user.name
}
