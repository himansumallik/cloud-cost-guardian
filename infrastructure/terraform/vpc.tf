resource "aws_vpc" "ccg_vpc" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "ccg-vpc-${var.environment}" }
}

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.ccg_vpc.id
  cidr_block              = "10.20.1.0/24"
  map_public_ip_on_launch = true
  availability_zone       = "${var.aws_region}a"
  tags = { Name = "ccg-public-subnet-a" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.ccg_vpc.id
  tags   = { Name = "ccg-igw" }
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.ccg_vpc.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}

resource "aws_route_table_association" "public_assoc" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_security_group" "ccg_sg" {
  name        = "ccg-host-sg"
  description = "Allow SSH, HTTP, and API access for Cloud Cost Guardian"
  vpc_id      = aws_vpc.ccg_vpc.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Web UI"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Express API"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
