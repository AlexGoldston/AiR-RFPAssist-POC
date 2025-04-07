import React, { useState, useEffect, useRef } from 'react';
import './App.css'

function App() {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [kbId, setKbId] = useState('');
    const [kbOptions, setKbOptions] = useState([]);
    const messagesEndRef = useRef(null);


    // fetch available KBs on component mount
    useEffect(() => {
        const fetchKnowledgeBases = async () => {
            try {
                const response = await fetch('/api/knowledge-bases');
                const data = await response.json();
                if (data.knowledgeBases && data.knowledgeBases.length > 0) {
                setKbOptions(data.knowledgeBases);
                setKbId(data.knowledgeBases[0].id);
                }
            } catch (error) {
                console.error('Error fetching knowledge bases:', error);
            }
            };
        
        fetchKnowledgeBases();
    }, []);

    // autoscroll to bottom of messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth'});
    }, [messages]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (input.trim() === '' || !kbId) return;

        const userMessage = { role: 'user', content: input};
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: input,
                    knowledgeBaseId: kbId
                }),
            });

            const data = await response.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        } catch (error) {
            console.error('error sending message: ', error);
            setMessages(prev => [...prev, {
                role: 'system',
                content: 'Error connecting to Bedrock. Please try again later'
            }]);
        } finally {
            setLoading(false);
        }
    };

return (
        <div className="App">
        <header className="App-header">
            <h1>Bedrock Knowledge Base Chat</h1>
            <div className="kb-selector">
            <label htmlFor="kb-select">Select Knowledge Base:</label>
            <select 
                id="kb-select"
                value={kbId}
                onChange={(e) => setKbId(e.target.value)}
            >
                {kbOptions.map(kb => (
                <option key={kb.id} value={kb.id}>{kb.name}</option>
                ))}
            </select>
            </div>
        </header>
        
        <div className="chat-container">
            <div className="messages-container">
            {messages.map((message, index) => (
                <div key={index} className={`message ${message.role}`}>
                <div className="message-content">{message.content}</div>
                </div>
            ))}
            {loading && (
                <div className="message assistant">
                <div className="message-content loading">
                    <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                    </div>
                </div>
                </div>
            )}
            <div ref={messagesEndRef} />
            </div>
            
            <form className="input-form" onSubmit={handleSendMessage}>
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                disabled={loading}
            />
            <button type="submit" disabled={loading}>Send</button>
            </form>
        </div>
        </div>
    );
}

export default App;