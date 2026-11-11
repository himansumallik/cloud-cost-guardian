# Auto-generated from Dashboard by Himansu Mallik (RA2311003012367) at 2026-11-11T10:57:32.481Z
resource "aws_iam_user" "dashboard_user" {
  name = var.resource_name
}
resource "aws_iam_access_key" "dashboard_key" {
  user = aws_iam_user.dashboard_user.name
}
