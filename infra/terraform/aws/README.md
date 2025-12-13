# AWS Deployment (Placeholder)

This directory contains a placeholder for AWS deployment using Amazon ECS/Fargate, RDS, and ElastiCache.

## Status

⚠️ **Not Yet Implemented** - This is a stub to demonstrate provider portability.

## Planned Resources

When implemented, this will provision:

- **Amazon ECS/Fargate**: Container orchestration for the AF Auth service
- **Amazon RDS for PostgreSQL**: Managed PostgreSQL database
- **Amazon ElastiCache for Redis**: Managed Redis cache
- **Amazon VPC**: Virtual private cloud for networking
- **Application Load Balancer**: HTTPS load balancer
- **AWS Secrets Manager**: Secret storage and rotation
- **AWS IAM**: Service roles and policies

## Implementation Guide

To implement AWS support, create the following files:

### Required Files

1. **main.tf**: AWS resource definitions
   - ECS cluster and task definition
   - RDS PostgreSQL instance
   - ElastiCache Redis cluster
   - VPC, subnets, security groups
   - Application Load Balancer
   - IAM roles and policies

2. **variables.tf**: Input variables
   - AWS region
   - Container image URI (ECR)
   - Database configuration
   - Redis configuration
   - Scaling parameters

3. **outputs.tf**: Output values
   - Service URL
   - Database endpoint
   - Redis endpoint

4. **terraform.tfvars.example**: Example variable values
   - Copy from GCP example and adapt for AWS

5. **backend.tf.example**: S3 backend configuration
   ```hcl
   terraform {
     backend "s3" {
       bucket = "your-terraform-state-bucket"
       key    = "af-auth/terraform.tfstate"
       region = "us-east-1"
       
       # Enable state locking with DynamoDB
       dynamodb_table = "terraform-state-lock"
       encrypt        = true
     }
   }
   ```

## Key Differences from GCP

- **ECS Task Definition** instead of Cloud Run service
- **RDS PostgreSQL** instead of Cloud SQL
- **ElastiCache** instead of Cloud Memorystore
- **ALB** for load balancing with ACM for HTTPS certificates
- **ECR** for container images instead of Artifact Registry
- **Secrets Manager** instead of Secret Manager (similar API)
- **VPC Endpoints** for private connectivity

## Resource Mapping

| GCP Resource | AWS Equivalent |
|--------------|----------------|
| Cloud Run | ECS on Fargate |
| Cloud SQL | RDS PostgreSQL |
| Cloud Memorystore | ElastiCache Redis |
| VPC Connector | VPC Endpoints |
| Secret Manager | Secrets Manager |
| Artifact Registry | Elastic Container Registry (ECR) |
| IAM Service Account | IAM Role |

## Container Image

Build and push to ECR:

```bash
# Create ECR repository
aws ecr create-repository --repository-name af-auth

# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t af-auth .
docker tag af-auth:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/af-auth:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/af-auth:latest
```

## Secrets Management

Create secrets in AWS Secrets Manager:

```bash
# GitHub OAuth credentials
aws secretsmanager create-secret \
  --name af-auth/github-client-id \
  --secret-string "your_client_id"

aws secretsmanager create-secret \
  --name af-auth/github-client-secret \
  --secret-string "your_client_secret"

# Session secret
aws secretsmanager create-secret \
  --name af-auth/session-secret \
  --secret-string "$(openssl rand -hex 32)"

# JWT keys (base64-encoded PEM)
aws secretsmanager create-secret \
  --name af-auth/jwt-private-key \
  --secret-string "$(base64 jwt-private.pem)"

aws secretsmanager create-secret \
  --name af-auth/jwt-public-key \
  --secret-string "$(base64 jwt-public.pem)"
```

## Network Configuration

AF Auth requires:
- Private subnets for RDS and ElastiCache
- Public subnets for Application Load Balancer
- NAT Gateway for ECS tasks to reach GitHub OAuth
- Security groups for task-to-database and task-to-redis access

## Contributing

If you implement AWS support, please:
1. Use the same variable naming conventions as GCP
2. Follow AWS best practices for security and networking
3. Document any AWS-specific configuration
4. Test with both private and public networking modes
5. Ensure Redis can be toggled for minimal deployments
