resource "aws_budgets_budget" "five_dollar_guardrail" {
  name         = "ccg-5-dollar-monthly-budget"
  budget_type  = "COST"
  limit_amount = "5.0"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}

resource "aws_cloudwatch_metric_alarm" "idle_cpu_alarm" {
  alarm_name          = "ccg-app-host-low-cpu"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 3600
  statistic           = "Average"
  threshold           = 5.0
  alarm_description   = "Triggers when EC2 CPU stays below 5% for 2 hours"
  dimensions = {
    InstanceId = aws_instance.ccg_app_host.id
  }
}
