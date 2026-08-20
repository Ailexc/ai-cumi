# AiCumi AG2 Backend

AiCumi AG2 Backend is a Python backend service for the AiCumi multi-agent collaboration platform, built with FastAPI and AG2 framework.

## Features

- **Agent Management**: Create, delete, and manage AG2 agents
- **Real-time Chat**: WebSocket support for real-time communication
- **Group Chat**: Multi-agent group chat with @mentions
- **REST API**: Full REST API for agent and chat management
- **AG2 Integration**: Built on AG2 framework for multi-agent orchestration

## Architecture

```
┌─────────────────────────────────────────┐
│          FastAPI Backend                 │
│  ┌─────────────┐  ┌─────────────┐       │
│  │ REST API    │  │ WebSocket   │       │
│  │ Endpoints   │  │ Server      │       │
│  └──────┬──────┘  └──────┬──────┘       │
│         │                │               │
│  ┌──────▼────────────────▼──────┐       │
│  │       Agent Manager          │       │
│  │  - Agent creation/deletion   │       │
│  │  - Message routing           │       │
│  │  - Group chat management     │       │
│  └──────────────┬───────────────┘       │
│                 │                        │
│  ┌──────────────▼───────────────┐       │
│  │         AG2 Framework        │       │
│  │  - Agent runtime             │       │
│  │  - Multi-agent orchestration │       │
│  │  - Tool execution            │       │
│  └──────────────────────────────┘       │
└─────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Python 3.10+
- OpenAI API key (or other supported LLM provider)

### Installation

1. **Navigate to the server directory**:
   ```bash
   cd AiCumi/server
   ```

2. **Activate the virtual environment**:
   ```bash
   source ../learning/ag2-env/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env file with your API keys
   ```

### Running the Server

1. **Start the server**:
   ```bash
   ./start.sh
   # or
   python run.py
   ```

2. **Access the API**:
   - API Documentation: http://localhost:8000/docs
   - Health Check: http://localhost:8000/health
   - API Endpoints: http://localhost:8000/api/

### Testing the API

Run the test script to verify the API is working:

```bash
python test_api.py
```

## API Endpoints

### Health Check

- `GET /` - Root endpoint
- `GET /health` - Health check with statistics

### Agent Management

- `POST /api/agents` - Create a new agent
- `GET /api/agents` - List all agents
- `GET /api/agents/{agent_id}` - Get agent details
- `DELETE /api/agents/{agent_id}` - Delete an agent

### Chat

- `POST /api/chat/send` - Send a message to an agent or group
- `WebSocket /ws/{room_id}` - Real-time chat via WebSocket

### Rooms

- `GET /api/rooms` - List all rooms
- `POST /api/rooms` - Create a new room

### Members

- `GET /api/members` - List all members (agents)

### Skills

- `GET /api/skills` - List available skills

## Configuration

The application can be configured through environment variables or `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `DEFAULT_MODEL` | Default LLM model | `gpt-4o-mini` |
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `8000` |
| `DEBUG` | Debug mode | `true` |
| `DATABASE_URL` | Database connection string | `sqlite+aiosqlite:///./data/aicumi.db` |

## Project Structure

```
server/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration settings
│   ├── agents/
│   │   ├── __init__.py
│   │   └── agent_manager.py # Agent management module
│   ├── chat/
│   │   ├── __init__.py
│   │   └── websocket_manager.py # WebSocket management
│   └── api/                 # API route handlers
├── data/                    # Database and data files
├── .env                     # Environment variables
├── .env.example             # Example environment file
├── requirements.txt         # Python dependencies
├── run.py                   # Server startup script
├── start.sh                 # Shell startup script
├── test_api.py              # API test script
└── README.md                # This file
```

## Development

### Adding New Agents

To add a new agent, send a POST request to `/api/agents`:

```json
{
  "agent_id": "new_agent",
  "name": "新Agent",
  "persona": "你是一个新Agent，负责...",
  "role": "specialist"
}
```

### Sending Messages

Send a message to an agent:

```json
{
  "content": "你好，请介绍一下你自己。",
  "room_id": "keling",
  "room_type": "dm"
}
```

### WebSocket Connection

Connect to WebSocket for real-time chat:

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/keling');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'chat.send',
    content: '你好！',
    room_type: 'dm'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

## Integration with Frontend

The backend is designed to work with the AiCumi React frontend. The API endpoints match the expected interface:

1. **Agent Management**: `/api/agents` endpoints
2. **Chat**: `/api/chat/send` and WebSocket `/ws/{room_id}`
3. **Rooms**: `/api/rooms` endpoints
4. **Members**: `/api/members` endpoint
5. **Skills**: `/api/skills` endpoint

## Troubleshooting

### Common Issues

1. **Import Error**: Make sure you're in the correct directory and virtual environment is activated
2. **API Key Error**: Check that your API keys are correctly set in `.env` file
3. **Port Already in Use**: Change the port in `.env` file or stop other services using port 8000

### Logs

The server logs are printed to the console. For production, consider using a logging framework.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is part of the AiCumi learning project.

## Support

For issues and questions, please refer to the project documentation or create an issue in the repository.