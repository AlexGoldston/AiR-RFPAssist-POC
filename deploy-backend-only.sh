#!/bin/bash
# deploy-backend-only.sh - Deploy just the API Gateway and Lambda components

set -e

# Configuration
STACK_NAME="bedrock-kb-chat-backend"
S3_BUCKET=""
AWS_REGION=$(aws configure get region)
[ -z "$AWS_REGION" ] && AWS_REGION="us-east-1"

# Print banner
echo "=================================================="
echo "  Bedrock Knowledge Base Backend-Only Deployment  "
echo "=================================================="

if [ -z "$S3_BUCKET" ]; then
  S3_BUCKET="bedrock-kb-chat-$(date +%s)"
  echo "Using S3 bucket: $S3_BUCKET"
fi

# Check if stack exists and delete if it's in a failed state
check_stack() {
  echo "Checking if stack exists..."
  if aws cloudformation describe-stacks --stack-name $STACK_NAME 2>/dev/null; then
    STACK_STATUS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].StackStatus" --output text)
    echo "Stack exists with status: $STACK_STATUS"
    
    if [[ "$STACK_STATUS" == *ROLLBACK* || "$STACK_STATUS" == *FAILED* ]]; then
      echo "Stack is in a failed state. Deleting stack..."
      aws cloudformation delete-stack --stack-name $STACK_NAME
      echo "Waiting for stack deletion to complete..."
      aws cloudformation wait stack-delete-complete --stack-name $STACK_NAME
      echo "Stack deleted successfully."
    fi
  else
    echo "Stack does not exist."
  fi
}

# Create the lambda directory if it doesn't exist
mkdir -p lambda

# Create the lambda function code file
cat > lambda/index.js << 'EOF'
const AWS = require('aws-sdk');
const bedrock = new AWS.BedrockRuntime();
const bedrockAgent = new AWS.BedrockAgent();

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));
  
  // Use the AWS_REGION from Lambda's runtime environment
  const region = process.env.AWS_REGION;
  
  try {
    // Check if this is a request to list knowledge bases
    if (event.path === '/api/knowledge-bases' && event.httpMethod === 'GET') {
      return await listKnowledgeBases();
    }
    
    // Handle chat requests
    if (event.path === '/api/chat' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { message, knowledgeBaseId } = body;
      
      if (!message || !knowledgeBaseId) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ error: 'Message and knowledgeBaseId are required' })
        };
      }
      
      const response = await queryChatWithRetrievalResponse(message, knowledgeBaseId, region);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ response })
      };
    }
    
    // Handle options requests (CORS)
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
        },
        body: ''
      };
    }
    
    // Return 404 for any other requests
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Not Found' })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};

// List all available knowledge bases
async function listKnowledgeBases() {
  const params = {
    maxResults: 20 // Adjust as needed
  };
  
  try {
    const data = await bedrockAgent.listKnowledgeBases(params).promise();
    
    // Format the KB list to include just id and name
    const knowledgeBases = data.knowledgeBaseSummaries.map(kb => ({
      id: kb.knowledgeBaseId,
      name: kb.name || kb.knowledgeBaseId
    }));
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ knowledgeBases })
    };
  } catch (error) {
    console.error('Error listing knowledge bases:', error);
    throw error;
  }
}

// Query the Knowledge Base and get a response
async function queryChatWithRetrievalResponse(message, knowledgeBaseId, region) {
  // You can customize the model ID as needed
  const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
  
  try {
    const response = await bedrockAgent.retrieveAndGenerate({
      input: {
        text: message
      },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId,
          modelArn: `arn:aws:bedrock:${region}:model/${modelId}`
        }
      }
    }).promise();
    
    // Extract the response text from the result
    const generatedResponse = response.output.text;
    return generatedResponse;
  } catch (error) {
    console.error('Error querying Bedrock with retrieval:', error);
    throw error;
  }
}
EOF

# Create the CloudFormation template (backend-only version)
cat > backend-template.yaml << EOF
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Bedrock Knowledge Base Chat Backend'

Parameters:
  LambdaCodeBucket:
    Type: String
    Description: S3 Bucket containing Lambda code

Resources:
  # IAM Role for Lambda Function
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: BedrockAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - bedrock:InvokeModel
                  - bedrock:InvokeModelWithResponseStream
                  - bedrock-agent:RetrieveAndGenerate
                  - bedrock-agent:Retrieve
                  - bedrock-agent:ListKnowledgeBases
                  - bedrock-agent:ListDataSources
                Resource: '*'

  # Lambda Function
  BedrockChatFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: bedrock-kb-chat-function
      Handler: index.handler
      Role: !GetAtt LambdaExecutionRole.Arn
      Runtime: nodejs18.x
      Timeout: 30
      MemorySize: 256
      Code:
        S3Bucket: !Ref LambdaCodeBucket
        S3Key: lambda-function.zip

  # API Gateway
  ChatAPI:
    Type: AWS::ApiGateway::RestApi
    Properties:
      Name: BedrockKBChatAPI
      Description: API for Bedrock Knowledge Base Chat

  # API Resources
  ChatResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref ChatAPI
      ParentId: !GetAtt ChatAPI.RootResourceId
      PathPart: 'api'
  
  ChatEndpoint:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref ChatAPI
      ParentId: !Ref ChatResource
      PathPart: 'chat'
  
  KnowledgeBasesResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref ChatAPI
      ParentId: !Ref ChatResource
      PathPart: 'knowledge-bases'

  # API Methods
  ChatMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ChatAPI
      ResourceId: !Ref ChatEndpoint
      HttpMethod: POST
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${BedrockChatFunction.Arn}/invocations
  
  KnowledgeBasesMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ChatAPI
      ResourceId: !Ref KnowledgeBasesResource
      HttpMethod: GET
      AuthorizationType: NONE
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${BedrockChatFunction.Arn}/invocations
  
  # CORS for Chat endpoint
  ChatCorsMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ChatAPI
      ResourceId: !Ref ChatEndpoint
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
              method.response.header.Access-Control-Allow-Methods: "'POST,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
            ResponseTemplates:
              application/json: ''
        PassthroughBehavior: WHEN_NO_MATCH
        RequestTemplates:
          application/json: '{"statusCode": 200}'
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true
  
  # CORS for KnowledgeBases endpoint
  KnowledgeBasesCorsMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref ChatAPI
      ResourceId: !Ref KnowledgeBasesResource
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
              method.response.header.Access-Control-Allow-Methods: "'GET,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
            ResponseTemplates:
              application/json: ''
        PassthroughBehavior: WHEN_NO_MATCH
        RequestTemplates:
          application/json: '{"statusCode": 200}'
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true

  # API Deployment
  ApiDeployment:
    Type: AWS::ApiGateway::Deployment
    DependsOn:
      - ChatMethod
      - ChatCorsMethod
      - KnowledgeBasesMethod
      - KnowledgeBasesCorsMethod
    Properties:
      RestApiId: !Ref ChatAPI
      StageName: prod

  # Lambda Permission for API Gateway
  LambdaPermission:
    Type: AWS::Lambda::Permission
    Properties:
      Action: lambda:InvokeFunction
      FunctionName: !Ref BedrockChatFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub arn:aws:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${ChatAPI}/*

Outputs:
  ApiEndpoint:
    Description: API Gateway endpoint URL
    Value: !Sub https://\${ChatAPI}.execute-api.\${AWS::Region}.amazonaws.com/prod
EOF

# Check and delete stack if needed
check_stack

# Create S3 bucket for CloudFormation template
echo "Creating S3 bucket for CloudFormation template..."
aws s3 mb s3://$S3_BUCKET --region $AWS_REGION || true

# Create a zip file for the Lambda function using PowerShell (for Windows)
echo "Creating Lambda function package..."
if [ -x "$(command -v zip)" ]; then
  # If zip is available, use it
  cd lambda
  zip -r ../lambda-function.zip .
  cd ..
else
  # If zip is not available, try using PowerShell (for Windows)
  echo "Zip command not found, trying PowerShell..."
  cd lambda
  powershell -command "Compress-Archive -Path .\* -DestinationPath ..\lambda-function.zip -Force"
  cd ..
fi

# Upload Lambda function to S3
echo "Uploading Lambda function package to S3..."
if [ -f lambda-function.zip ]; then
  aws s3 cp lambda-function.zip s3://$S3_BUCKET/lambda-function.zip
fi

# Deploy with CloudFormation
echo "Deploying with CloudFormation..."
aws cloudformation deploy \
  --template-file backend-template.yaml \
  --stack-name $STACK_NAME \
  --parameter-overrides LambdaCodeBucket=$S3_BUCKET \
  --capabilities CAPABILITY_IAM

# Get outputs
echo "Getting deployment outputs..."
API_URL=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text)

echo
echo "Backend deployment complete!"
echo "API URL: $API_URL"
echo
echo "You can now access your Bedrock Knowledge Bases via this API."
echo "You'll need to host the frontend separately and configure it to use this API endpoint."