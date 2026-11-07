resource "aws_iam_role" "ccg_ec2_role" {
  name = "ccg-ec2-finops-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ccg_finops_policy" {
  name = "ccg-least-privilege-finops"
  role = aws_iam_role.ccg_ec2_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DiscoveryAndMetricsReadOnly"
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeVolumes",
          "ec2:DescribeSnapshots",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "s3:ListAllMyBuckets",
          "iam:ListAccessKeys"
        ]
        Resource = "*"
      },
      {
        Sid    = "ApprovedRemediationActions"
        Effect = "Allow"
        Action = [
          "ec2:StopInstances",
          "ec2:CreateSnapshot",
          "ec2:DeleteVolume"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ccg_profile" {
  name = "ccg-instance-profile"
  role = aws_iam_role.ccg_ec2_role.name
}
