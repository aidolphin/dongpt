from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import requests
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

DEFAULT_TIMEOUT = 45

# Configure Gemini if key is present
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
if GOOGLE_API_KEY:
    genai.configure(api_key="AIzaSyA6qyiGTba0szrlIQlbQHu9Z2vaJMKHscA")


def is_ollama_available():
    base_url = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    try:
        res = requests.get(f"{base_url}/api/tags", timeout=2)
        return res.ok
    except requests.RequestException:
        return False


def _extract_openai_style_text(data):
    try:
        return data["choices"][0]["message"]["content"]
    except Exception:
        return str(data)


def call_gemini(user_input, model=None):
    if not GOOGLE_API_KEY:
        raise RuntimeError("Missing GOOGLE_API_KEY (or GEMINI_API_KEY)")

    use_model = model or "gemini-2.5-flash"
    gm = genai.GenerativeModel(use_model)
    response = gm.generate_content(user_input)
    return response.text if hasattr(response, "text") else str(response)


def call_groq(user_input, model=None):
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("Missing GROQ_API_KEY")

    use_model = model or "llama-3.1-8b-instant"
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": use_model,
        "messages": [{"role": "user", "content": user_input}],
        "temperature": 0.5,
    }

    res = requests.post(url, json=payload, headers=headers, timeout=DEFAULT_TIMEOUT)
    res.raise_for_status()
    return _extract_openai_style_text(res.json())


def call_openrouter(user_input, model=None):
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("Missing OPENROUTER_API_KEY")

    use_model = model or "meta-llama/llama-3.1-8b-instruct:free"
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    site_url = os.environ.get("OPENROUTER_SITE_URL")
    site_name = os.environ.get("OPENROUTER_SITE_NAME")
    if site_url:
        headers["HTTP-Referer"] = site_url
    if site_name:
        headers["X-Title"] = site_name

    payload = {
        "model": use_model,
        "messages": [{"role": "user", "content": user_input}],
        "temperature": 0.5,
    }

    res = requests.post(url, json=payload, headers=headers, timeout=DEFAULT_TIMEOUT)
    res.raise_for_status()
    return _extract_openai_style_text(res.json())


def call_ollama(user_input, model=None):
    base_url = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    use_model = model or os.environ.get("OLLAMA_MODEL", "llama3.2:3b")
    url = f"{base_url.rstrip('/')}/api/generate"

    payload = {
        "model": use_model,
        "prompt": user_input,
        "stream": False,
    }

    res = requests.post(url, json=payload, timeout=DEFAULT_TIMEOUT)
    res.raise_for_status()
    data = res.json()
    return data.get("response", str(data))


def available_providers():
    providers = []
    if GOOGLE_API_KEY:
        providers.append("gemini")
    if os.environ.get("GROQ_API_KEY"):
        providers.append("groq")
    if os.environ.get("OPENROUTER_API_KEY"):
        providers.append("openrouter")

    # Ollama only when local server is actually reachable
    if is_ollama_available():
        providers.append("ollama")
    return providers


def resolve_provider(requested):
    requested = (requested or "auto").strip().lower()
    configured = available_providers()

    if requested == "auto":
        # Priority: Gemini -> Groq -> OpenRouter -> Ollama
        for candidate in ["gemini", "groq", "openrouter", "ollama"]:
            if candidate in configured:
                return candidate
        return None

    if requested in ["gemini", "groq", "openrouter", "ollama"]:
        return requested

    return None


def route_model_call(provider, user_input, model):
    if provider == "gemini":
        return call_gemini(user_input, model)
    if provider == "groq":
        return call_groq(user_input, model)
    if provider == "openrouter":
        return call_openrouter(user_input, model)
    if provider == "ollama":
        return call_ollama(user_input, model)
    raise RuntimeError(f"Unsupported provider: {provider}")


@app.route("/api/providers", methods=["GET"])
def list_providers():
    return jsonify({"providers": available_providers()})


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json() or {}
    user_input = str(data.get("input", "")).strip()
    provider_requested = data.get("provider", "auto")
    model = data.get("model")

    if not user_input:
        return jsonify({"text": "I didn't receive any message."}), 400

    provider = resolve_provider(provider_requested)
    if not provider:
        return jsonify({
            "text": (
                "No available provider found. Set GOOGLE_API_KEY for Gemini "
                "or run Ollama on http://127.0.0.1:11434."
            ),
            "available_providers": available_providers(),
        }), 400

    try:
        text = route_model_call(provider, user_input, model)
        return jsonify({
            "text": text,
            "provider": provider,
            "model": model or "default",
        })
    except requests.RequestException as e:
        return jsonify({"text": f"Provider network error ({provider}): {str(e)}"}), 502
    except RuntimeError as e:
        return jsonify({"text": f"Provider setup error ({provider}): {str(e)}"}), 400
    except Exception as e:
        return jsonify({"text": f"Error from {provider}: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(debug=True)
