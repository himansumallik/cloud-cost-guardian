pipeline {
    agent any

    environment {
        GHCR_REGISTRY = 'ghcr.io'
        IMAGE_PREFIX  = 'ghcr.io/cloud-cost-guardian'
        AWS_REGION    = 'ap-south-1'
    }

    triggers {
        pollSCM('H/5 * * * *')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install & Lint') {
            steps {
                sh 'npm --prefix apps/api ci'
                sh 'npm --prefix apps/api run lint'
                sh 'npm --prefix apps/web ci'
            }
        }

        stage('Unit & Integration Tests') {
            steps {
                sh 'npm --prefix apps/api test'
            }
        }

        stage('Security Audit (npm audit & Trivy)') {
            steps {
                sh 'npm --prefix apps/api audit --audit-level=high || true'
                sh 'trivy fs --exit-code 0 --severity HIGH,CRITICAL . || true'
            }
        }

        stage('Terraform Validate') {
            steps {
                dir('infrastructure/terraform') {
                    sh 'terraform init -backend=false'
                    sh 'terraform validate'
                }
            }
        }

        stage('Build & Push Images to GHCR') {
            when {
                branch 'develop'
            }
            steps {
                withCredentials([usernamePassword(credentialsId: 'ghcr-credentials', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
                    sh '''
                        echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
                        docker build -t ${IMAGE_PREFIX}/api:${BUILD_NUMBER} -t ${IMAGE_PREFIX}/api:latest ./apps/api
                        docker build -t ${IMAGE_PREFIX}/web:${BUILD_NUMBER} -t ${IMAGE_PREFIX}/web:latest ./apps/web
                        docker push ${IMAGE_PREFIX}/api:${BUILD_NUMBER}
                        docker push ${IMAGE_PREFIX}/api:latest
                        docker push ${IMAGE_PREFIX}/web:${BUILD_NUMBER}
                        docker push ${IMAGE_PREFIX}/web:latest
                    '''
                }
            }
        }

        stage('Manual Approval Gate') {
            when {
                branch 'develop'
            }
            steps {
                input message: 'Approve deployment of Cloud Cost Guardian to AWS EC2 Sandbox?', ok: 'Approve & Deploy'
            }
        }

        stage('Ansible Deploy to EC2') {
            when {
                branch 'develop'
            }
            steps {
                dir('infrastructure/ansible') {
                    sh 'ansible-playbook -i inventory/aws_ec2.yml playbook.yml'
                }
            }
        }
    }

    post {
        always {
            echo "Pipeline completed for build #${BUILD_NUMBER}. Run 'terraform destroy' after your demo session!"
        }
    }
}
