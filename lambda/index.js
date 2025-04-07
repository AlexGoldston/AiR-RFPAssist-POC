const AWS = require('aws-sdk');
const bedrock = new AWS.BedrockRuntime();
const bedrockAgent = new AWS.BedrockAgent();

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    try {
        
        // check if this is a request to list KBs
        if (event.path === '/api/knowledge-bases' && event.httpMethod === 'GET') {
            return await listKnowledgeBases();
        }

        // handle chat requests
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

            const response = await queryChatWithRetrievalResponse(message, knowledgeBaseId);

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

        // return 404 for any other requests
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
            body: JSON.stringify({ error: error.message || 'Internal Service Error' })
        };
    }
}

// list all available knowledgebases
async function listKnowledgeBases() {
    const params = {
        maxResults: 20
    };

    try {
        const data = await bedrockAgent.listKnowledgeBases(params).promise();

        // format KB list to include just id and name
        const knowledgebases = data.knowledgeBaseSummaries.map(kb => ({
            id: kb.knowledgeBaseId,
            name: kb.name || kb.knowledgeBaseId
        }));

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ knowledgebases })
        };
    } catch (error) {
        console.error('Error listing knowledge bases:', error);
        throw error;
    }
}

// query the knowledgebase and get a response
async function queryChatWithRetrievalResponse(message, knowledgebaseId) {
    //customise model id as needed
    const modelId = 'anthropic.claude-3-5-haiku-20241022-v1:0'

    const payload = {
        input: {
            text: message
        },
        retrieveConfig: {
            knowledgeBaseConfigurations: [
                {
                    knowledgebaseId,
                    modelArn: `arn:aws:bedrock:${process.env.AWS_REGION}:model/${modelId}`
                }
            ]
        }
    };

    try {
        const response = await bedrockAgent.retrieveAndGenerate({
            input: {
                text: message
            },
            retrieveAndGenerateConfiguration: {
                type: 'KNOWLEDGE_BASE',
                knowledgeBaseConfiguration: {
                    knowledgebaseId,
                    modelArn: `arn:aws:bedrock:${process.env.AWS_REGION}:model/${modelId}`
                }
            }
        }).promise();

        // extract the response text from the result
        const generatedResponse = respoinse.output.text;
        return generatedResponse;
    } catch (error) {
        console.error('Error quering bedrock with retrieval: ', error);
        throw error;
    }
}