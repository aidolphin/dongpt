
# Space Project 5 Chitra

## Overview
Space Project 5 Chitra is a web-based chat application designed for clarity and ease of use. It features a Python backend and a modern, mobile-friendly frontend built with HTML, CSS, and JavaScript. The backend handles AI-powered responses, while the frontend provides a clean, readable chat interface.

## Structure
- **backend/**
  - `app.py`: Main backend server (Flask, Gemini AI integration)
  - `requirements.txt`: Python dependencies
- **frontend/**
  - `index.html`: Main web page
  - `app.js`: Chat logic and UI rendering
  - `styles.css`: Responsive and visually clear design

## How to Run

### Backend
1. Make sure Python 3 is installed on your system.
2. Go to the backend folder:
   ```bash
   cd backend
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set your Gemini API key:
   ```bash
   export GOOGLE_API_KEY="your_api_key_here"
   ```
5. Start the backend server:
   ```bash
   python app.py
   ```

### Frontend
1. Go to the frontend folder:
   ```bash
   cd frontend
   ```
2. Open `index.html` in your browser.

## Features
- Clean, readable chat interface
- Mobile-friendly and full-screen by default
- AI answers are formatted for easy reading (paragraphs, lists, definitions)
- Electric cyan highlights for DoneGPT name and message input
- Easy setup and troubleshooting

## Design Notes
- The frontend uses white and lavender backgrounds with black text for clarity.
- All chat messages and UI elements are fully responsive and scale to any device.
- AI answers are automatically formatted for readability, with clear separation of paragraphs, lists, and definitions.

## Troubleshooting
- If the backend fails to start, check that your API key is set and all Python packages are installed.
- If the frontend does not display correctly, refresh your browser or clear cache.
- For any errors, check the browser console or backend terminal for details.

## License
This project is open for learning and demonstration purposes.
