#!/bin/bash

# AiCumi AG2 Backend Startup Script

echo "🚀 Starting AiCumi AG2 Backend..."

# Check if virtual environment exists
if [ ! -d "../learning/ag2-env" ]; then
    echo "❌ Virtual environment not found. Please create one first."
    exit 1
fi

# Activate virtual environment
source ../learning/ag2-env/bin/activate

# Check if dependencies are installed
echo "📦 Checking dependencies..."
pip install -q -r requirements.txt

# Create data directory if it doesn't exist
mkdir -p data

# Start the server
echo "🌟 Starting server..."
python run.py