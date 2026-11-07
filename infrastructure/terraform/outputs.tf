output "app_host_public_ip" {
  description = "Public IPv4 of the Cloud Cost Guardian EC2 host"
  value       = aws_instance.ccg_app_host.public_ip
}

output "waste_instance_id" {
  description = "Instance ID of the intentional idle waste EC2 instance"
  value       = try(aws_instance.idle_waste_instance[0].id, null)
}

output "waste_volume_id" {
  description = "Volume ID of the intentional unattached 1GB EBS volume"
  value       = try(aws_ebs_volume.unattached_waste_volume[0].id, null)
}
