const AWS = require('aws-sdk');
const bedrock = new AWS.BedrockRuntime();
const bedrockAgent = new AWS.BedrockAgent();
console.log('AWS SDK initialised')

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));
  
  // Use the AWS_REGION from Lambda's runtime environment
  const region = process.env.AWS_REGION;
  console.log('Using AWS Region:', region);
  
  try {
    // Check if this is a request to list knowledge bases
    if (event.path === '/api/knowledge-bases' && event.httpMethod === 'GET') {
      console.log('Processing request to list knowledge bases');
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
    console.log('Calling bedrockAgent.listKnowledgeBases with params:', JSON.stringify(params));
    const data = await bedrockAgent.listKnowledgeBases(params).promise();
    console.log('Response from listKnowledgeBases:', JSON.stringify(data));
    
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
    console.error('Top-level error caught:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: error.message || 'Internal Server Error',
        errorDetails: {
          name: error.name,
          code: error.code,
          statusCode: error.statusCode,
          requestId: error.requestId
        }
      })
    };
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
