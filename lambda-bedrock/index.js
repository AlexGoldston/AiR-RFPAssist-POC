const AWS = require('aws-sdk');

// Initialize only the clients we actually use
const bedrockAgent = new AWS.BedrockAgent();
const bedrockAgentRuntime = new AWS.BedrockAgentRuntime();
const bedrockRuntime = new AWS.BedrockRuntime();

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));
  
  // Use the AWS_REGION from Lambda's runtime environment
  const region = process.env.AWS_REGION;
  console.log('Using region:', region);
  
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
};

// List all available knowledge bases
async function listKnowledgeBases() {
  const params = {};
  
  try {
    console.log('Calling bedrockAgent.listKnowledgeBases');
    const data = await bedrockAgent.listKnowledgeBases(params).promise();
    console.log('Response from listKnowledgeBases:', JSON.stringify(data));
    
    // Format the KB list to include just id and name
    const knowledgeBases = data.knowledgeBaseSummaries ? data.knowledgeBaseSummaries.map(kb => ({
      id: kb.knowledgeBaseId,
      name: kb.name || kb.knowledgeBaseId
    })) : [];
    
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
    console.error('Error details:', {
      name: error.name,
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Error listing knowledge bases: ' + error.message,
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
  const modelId = "us.anthropic.claude-3-7-sonnet-20250219-v1:0";
  
  try {
    console.log('Retrieving and generating with message:', message);
    console.log('Using knowledge base ID:', knowledgeBaseId);
    console.log('Using region:', region);
    
    try {
      console.log('Attempting to retrieve using BedrockAgentRuntime');
      
      // First, retrieve relevant passages using the retrieve API
      const retrieveParams = {
        knowledgeBaseId: knowledgeBaseId,
        retrievalQuery: {
          text: message
        }
      };
      
      console.log('Retrieve params:', JSON.stringify(retrieveParams));
      const retrieveResponse = await bedrockAgentRuntime.retrieve(retrieveParams).promise();
      console.log('Retrieved citations:', JSON.stringify(retrieveResponse));
      
      // Format the retrieved citations as context
      let context = '';
      if (retrieveResponse.retrievalResults && retrieveResponse.retrievalResults.length > 0) {
        context = "Information from knowledge base:\n\n";
        retrieveResponse.retrievalResults.forEach((citation, index) => {
          if (citation.content && citation.content.text) {
            context += `Citation ${index + 1}: ${citation.content.text}\n\n`;
          }
        });
      }
      
      const promptParams = {
        modelId: modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Based on the following information, please answer this question: "${message}"\n\n${context}`
                }
              ]
            }
          ]
        })
      };
      
      console.log('Invoking model with params (truncated):', JSON.stringify(promptParams).substring(0, 200) + '...');
      const generateResponse = await bedrockRuntime.invokeModel(promptParams).promise();
      
      // Parse the response
      const responseBody = JSON.parse(Buffer.from(generateResponse.body).toString());
      console.log('Generated response (truncated):', JSON.stringify(responseBody).substring(0, 200) + '...');
      
      // Extract the response text based on Claude's output format
      let responseText = "Sorry, I couldn't generate a response.";
      if (responseBody.content && responseBody.content.length > 0) {
        responseText = responseBody.content[0].text;
      } else if (responseBody.completion) {
        responseText = responseBody.completion;
      }
      
      return responseText;
    }
    catch (retrieverError) {
      console.error('Error with retrieve and generate approach:', retrieverError);
      
      // Fallback to direct API call if available
      console.log('Trying direct knowledge base query using BedrockAgent');
      
      try {
        const directParams = {
          knowledgeBaseId: knowledgeBaseId,
          input: {
            text: message
          }
        };
        
        console.log('Direct query params:', JSON.stringify(directParams));
        const directResponse = await bedrockAgent.retrieveAndGenerate(directParams).promise();
        console.log('Direct query response:', JSON.stringify(directResponse));
        
        if (directResponse && directResponse.output && directResponse.output.text) {
          return directResponse.output.text;
        } else {
          throw new Error('Invalid response format from direct query');
        }
      }
      catch (directError) {
        console.error('Error with direct query approach:', directError);
        
        // Final fallback - just use the model directly
        console.log('Falling back to direct model invocation');
        
        const fallbackParams = {
          modelId: modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1000,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Please answer this question: ${message}\n\nIf you don't know the answer, please state that you don't have enough information.`
                  }
                ]
              }
            ]
          })
        };
        
        const fallbackResponse = await bedrockRuntime.invokeModel(fallbackParams).promise();
        const fallbackBody = JSON.parse(Buffer.from(fallbackResponse.body).toString());
        
        if (fallbackBody.content && fallbackBody.content.length > 0) {
          return fallbackBody.content[0].text;
        } else if (fallbackBody.completion) {
          return fallbackBody.completion;
        } else {
          return "I apologize, but I couldn't retrieve information from the knowledge base to answer your question.";
        }
      }
    }
  } catch (error) {
    console.error("Error querying Bedrock with retrieval:", error);
    console.error("Error details:", {
      name: error.name,
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}