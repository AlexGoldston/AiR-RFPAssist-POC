#!/bin/bash
# deploy.sh - deploy the app by making executable with `chmod +x deploy.sh` then in bash ./deploy.sh

set -e

# Configuration
STACK_NAME="bedrock-kb-chat"
GITHUB_REPO=""
GITHUB_TOKEN=""
S3_BUCKET=""
AWS_REGION=$(aws configure get region)
[ -z "$AWS_REGION" ] && AWS_REGION="us-east-1"

# Print banner
echo "=========================================="
echo "  Bedrock Knowledge Base Chat Deployment  "
echo "=========================================="

# Get inputs if not provided
if [ -z "$GITHUB_REPO" ]; then
  read -p "Enter your GitHub repository (username/repo): " GITHUB_REPO
fi

if [ -z "$GITHUB_TOKEN" ]; then
  read -p "Enter your GitHub personal access token: " -s GITHUB_TOKEN
  echo
fi

if [ -z "$S3_BUCKET" ]; then
  S3_BUCKET="bedrock-kb-chat-$(date +%s)"
  echo "Using S3 bucket: $S3_BUCKET"
fi

# Create S3 bucket for CloudFormation template
echo "Creating S3 bucket for CloudFormation template..."
aws s3 mb s3://$S3_BUCKET --region $AWS_REGION || true

# Package and upload the CloudFormation template
echo "Packaging CloudFormation template..."
aws cloudformation package \
  --template-file template.yaml \
  --s3-bucket $S3_BUCKET \
  --output-template-file packaged-template.yaml

# Deploy with CloudFormation
echo "Deploying with CloudFormation..."
aws cloudformation deploy \
  --template-file packaged-template.yaml \
  --stack-name $STACK_NAME \
  --parameter-overrides \
    GitHubRepo=$GITHUB_REPO \
    GitHubToken=$GITHUB_TOKEN \
  --capabilities CAPABILITY_IAM

# Get outputs
echo "Getting deployment outputs..."
API_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text)
APP_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='AmplifyAppUrl'].OutputValue" --output text)

echo
echo "Deployment complete!"
echo "API URL: $API_URL"
echo "App URL: $APP_URL"
echo
echo "Note: The Amplify app will take a few minutes to build and deploy."
echo "You can check the status in the Amplify Console."