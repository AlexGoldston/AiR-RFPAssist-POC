# Bedrock Knowledge Base Chat App

A lightweight chat frontend for testing AWS Bedrock Knowledge Bases.

## Prerequisites

- AWS Account with appropriate permissions
- Bedrock Knowledge Bases already set up
- GitHub account and repository to store your code
- Node.js and npm installed locally
- AWS CLI configured with appropriate credentials

## Project Structure

```
bedrock-kb-chat/
├── public/
│   └── index.html
├── src/
│   ├── App.js       # Main React component
│   ├── App.css      # Styling for the app
│   └── index.js     # React entry point
├── lambda/
│   └── index.js     # Lambda function code
├── template.yaml    # CloudFormation template
└── README.md        # This file
```

## Deployment Instructions

### 1. Create a GitHub Repository

Create a new repository on GitHub and push the code to it:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/bedrock-kb-chat.git
git push -u origin main
```

### 2. Create a GitHub Personal Access Token

1. Go to GitHub Settings > Developer settings > Personal access tokens
2. Generate a new token with `repo` scope permissions
3. Copy the token for use in the next step

### 3. Deploy with AWS CloudFormation

You can deploy the app using either the AWS Console or AWS CLI:

#### Using AWS Console:

1. Navigate to the CloudFormation console
2. Click "Create stack" > "With new resources"
3. Upload the `template.yaml` file
4. Fill in the parameters:
   - AmplifyAppName: Name for your Amplify app
   - GitHubRepo: Your GitHub repository (username/repo)
   - GitHubToken: The personal access token you created

#### Using AWS CLI:

```bash
aws cloudformation create-stack \
  --stack-name bedrock-kb-chat \
  --template-body file://template.yaml \
  --parameters \
    ParameterKey=AmplifyAppName,ParameterValue=bedrock-kb-chat \
    ParameterKey=GitHubRepo,ParameterValue=yourusername/bedrock-kb-chat \
    ParameterKey=GitHubToken,ParameterValue=your-github-token \
  --capabilities CAPABILITY_IAM
```

### 4. Monitor Deployment

1. Watch the CloudFormation stack creation progress in the AWS Console
2. Once complete, check the "Outputs" tab to get the URL of your deployed application

## Local Development Setup

To run the application locally for development:

1. Create a `.env` file in the project root with your API endpoint:
   ```
   REACT_APP_API_ENDPOINT=https://your-api-id.execute-api.region.amazonaws.com/prod
   ```

2. Install dependencies and start the development server:
   ```bash
   npm install
   npm start
   ```

3. The app should open in your browser at http://localhost:3000

## Using the Chat Application

1. Open the deployed application URL
2. Select one of your Knowledge Bases from the dropdown
3. Type questions in the input field and press Enter or click Send
4. The application will query your Bedrock Knowledge Base and display the response

## Additional Configuration

### Custom Model Selection

By default, the application uses `anthropic.claude-3-sonnet-20240229-v1:0` as the model for Bedrock. To use a different model:

1. Edit the Lambda function code in `lambda/index.js`
2. Change the `modelId` variable in the `queryChatWithRetrievalResponse` function
3. Redeploy the Lambda function

### Troubleshooting

If you encounter any issues:

1. Check the CloudWatch Logs for the Lambda function to diagnose backend issues
2. Inspect the browser console for frontend errors
3. Verify that your IAM roles have the necessary permissions for Bedrock and Knowledge Bases

## Clean Up

To remove all resources when you're done testing:

```bash
aws cloudformation delete-stack --stack-name bedrock-kb-chat
```

This will delete all the resources created by the CloudFormation template.