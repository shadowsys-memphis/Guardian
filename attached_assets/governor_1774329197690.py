import os
import json
import time
import requests
from datetime import datetime
from google import genai
from google.genai import types

# ==============================================================================
# WIRING EXPLANATION (Plain English):
# 1. This is the "Sovereign Staff" Governor (v1.3) - "Ultra + Perplexity" Edition.
# 2. It uses Gemini 3.1 Pro (Ultra) for high-level synthesis and orchestration.
# 3. It uses Perplexity AI (Sonar) for real-time web-grounded research (Curiosity).
# 4. It maintains a "Logic Bridge" so you always understand the AI's reasoning.
# ==============================================================================

# Configuration
DEV_ROOT = "/Users/memphis-dev-m4/Desktop/memphis-dev"
MANIFEST_PATH = os.path.join(os.path.dirname(__file__), 'manifest.json')

# API Keys
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY") or "AIzaSyB8KKiW7z7t1TOmrxxfEL-dd_RmyU7UBMM"
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY") # User to provide

# Initialize Gemini Client (Orchestrator)
client = genai.Client(api_key=GEMINI_API_KEY)
# Priority list to avoid unwanted 1.5 fallbacks
ULTRA_MODELS = [
    "gemini-3.1-pro-preview",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-1.5-pro" # True last resort
]

class GovernorAgent:
    def __init__(self):
        self.manifest = self._load_manifest()
        self.pillars = self.manifest.get('pillars', {})

    def _load_manifest(self):
        try:
            with open(MANIFEST_PATH, 'r') as f:
                return json.load(f)
        except:
            return {}

    def get_system_pulse(self):
        """Scans global dev root for activity in the last 24 hours."""
        pulse = []
        now = time.time()
        window = 24 * 3600
        try:
            for root, dirs, files in os.walk(DEV_ROOT):
                dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', 'dist', '.gemini', '.tmp.driveupload', '.tmp.drivedownload')]
                for f in files:
                    if f.startswith('.') or f == 'package-lock.json': continue
                    fpath = os.path.join(root, f)
                    try:
                        mtime = os.path.getmtime(fpath)
                        if now - mtime < window:
                            pulse.append(f"MODIFIED: {os.path.relpath(fpath, DEV_ROOT)}")
                    except: continue
                if root.count(os.sep) - DEV_ROOT.count(os.sep) > 2: dirs[:] = []
        except Exception as e:
            pulse.append(f"Pulse error: {e}")
        return "\n".join(pulse[:50])

    def query_perplexity(self, query):
        """Utilizes Perplexity Sonar for real-time web-grounded research."""
        if not PERPLEXITY_API_KEY:
            return "Perplexity research skipped (Missing API Key)."
        
        url = "https://api.perplexity.ai/chat/completions"
        payload = {
            "model": "sonar-pro", # Latest Sonar model for high-tier research
            "messages": [
                {"role": "system", "content": "You are a research agent specialized in AI and Crypto trends. Provide concise, high-signal summaries with citations."},
                {"role": "user", "content": query}
            ]
        }
        headers = {
            "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
            "Content-Type": "application/json"
        }
        try:
            response = requests.post(url, json=payload, headers=headers)
            data = response.json()
            return data['choices'][0]['message']['content']
        except Exception as e:
            return f"Perplexity error: {e}"

    def synthesize(self):
        """High-reasoning synthesis across Gemini and Perplexity."""
        print(f"\n📡 [M4 SOVEREIGN GOVERNOR v1.3] - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        print("=" * 80)
        
        pulse = self.get_system_pulse()
        research = ""
        
        # Trigger Perplexity for the Curiosity pillar if enabled
        if PERPLEXITY_API_KEY:
            print("🔍 [CURIOSITY AGENT] - Researching AI/Crypto trends...")
            research = self.query_perplexity("What are the top 3 high-signal AI/Crypto innovations from the last 24 hours?")
        
        system_instruction = """
        You are the "Sovereign Staff" Governor, an autonomous Chief of Staff for an elite M4 developer.
        You use the "Goldilocks Rule": be helpful, not invasive.
        You manage 'Deep Sea' coding chaos across:
        1. Leveraged Income (Productivity)
        2. Autonomous Code (Passion)
        3. Future Innovation (Curiosity)
        """
        
        prompt = f"""
        SYSTEM PULSE:
        {pulse}
        
        PERPLEXITY RESEARCH (CURIOSITY):
        {research}
        
        PILLARS:
        {json.dumps(self.pillars, indent=2)}
        
        TASK:
        1. Trajectory Analysis.
        2. Identify the Lagging Pillar.
        3. Goldilocks Action (Specific starting point).
        4. Logic Bridge (Plain English reasoning).
        """

        # Ultra-tier smart model switching
        for model_name in ULTRA_MODELS:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    config=types.GenerateContentConfig(system_instruction=system_instruction, temperature=0.7),
                    contents=prompt
                )
                print(f"✅ MODEL ACTIVE: {model_name}\n")
                print(response.text)
                break 
            except Exception as e:
                print(f"⚠️ {model_name} unavailable: {e}")
                continue
        
        print("=" * 80)

if __name__ == "__main__":
    agent = GovernorAgent()
    agent.synthesize()
