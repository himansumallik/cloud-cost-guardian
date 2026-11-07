# Auto-generated from Dashboard by Himansu Mallik (RA2311003012367) at 2026-11-06T16:08:27.855Z
resource "aws_instance" "dashboard_ec2" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  subnet_id     = aws_subnet.public_a.id
  tags = {
    Name      = var.resource_name
    ManagedBy = "TerraformDashboard"
  }
}
