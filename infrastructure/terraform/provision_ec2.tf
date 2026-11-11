# Auto-generated from Dashboard by Himansu Mallik (RA2311003012367) at 2026-11-11T10:44:40.864Z
resource "aws_instance" "dashboard_ec2" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  subnet_id     = aws_subnet.public_a.id
  tags = {
    Name      = var.resource_name
    ManagedBy = "TerraformDashboard"
  }
}
