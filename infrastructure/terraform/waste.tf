# Intentional "Waste" Module (Day 8) to test Discovery, Detection Rules, and Remediation
resource "aws_instance" "idle_waste_instance" {
  count                  = var.enable_waste_simulation ? 1 : 0
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t3.micro"
  subnet_id              = aws_subnet.public_a.id
  vpc_security_group_ids = [aws_security_group.ccg_sg.id]

  tags = {
    Name        = "ccg-waste-idle-worker"
    Purpose     = "FinOpsWasteSimulation"
    Environment = "sandbox-waste"
  }
}

resource "aws_ebs_volume" "unattached_waste_volume" {
  count             = var.enable_waste_simulation ? 1 : 0
  availability_zone = "${var.aws_region}a"
  size              = 1
  type              = "gp3"
  encrypted         = true

  tags = {
    Name        = "ccg-unattached-1gb-waste"
    Purpose     = "FinOpsWasteSimulation"
    Environment = "sandbox-waste"
  }
}
