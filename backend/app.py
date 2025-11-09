from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import google.generativeai as genai  # ✅ Import Gemini SDK

app = Flask(__name__)
CORS(app)

# ✅ Configure Gemini API key (store safely in environment)
genai.configure(api_key=os.environ.get("AIzaSyBsdEI8YIaMbD1uf9Twz7zuTOqeGi0Yx_8"))
# Example: export GEMINI_API_KEY="your_api_key_here"


def call_gemini(user_input):
    """Call Gemini API and return response in JSON format"""
    try:
        # ✅ Create Gemini model instance
        model = genai.GenerativeModel("gemini-2.5-flash")  # or gemini-1.5-pro

        # ✅ Generate AI response
        response = model.generate_content(user_input)

        # ✅ Extract text safely
        text = response.text if hasattr(response, "text") else str(response)
        return {"text": text}
    except Exception as e:
        return {"text": f"Error: {str(e)}"}


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json() or {}
    user_input = data.get("input", "").strip()
    if not user_input:
        return jsonify({"text": "I didn't receive any message."}), 400

    # ✅ Call Gemini and return response
    res = call_gemini(user_input)
    return jsonify(res)


if __name__ == "__main__":
    app.run(debug=True)
