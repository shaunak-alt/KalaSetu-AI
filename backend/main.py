import os
import base64
import json
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import google.generativeai as genai

# --- Configuration ---
load_dotenv()
app = FastAPI()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
STABILITY_API_KEY = os.getenv("STABILITY_API_KEY")

if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class GenerationRequest(BaseModel):
    imageBase64: str
    story: str

# --- Core AI Logic ---

def call_gemini_for_text_and_prompts(story: str, image_bytes: bytes):
    model = genai.GenerativeModel('gemini-1.5-flash-latest')
    prompt = f"""
    You are an expert e-commerce and social media marketer for local artisans.
    Based on the artisan's story: "{story}" and the provided product image,
    Generate a JSON object with the following keys:
    - "productTitle": A short, catchy title.
    - "productStory": A compelling story of about 150 words.
    - "socialMediaCaptions": An array of 2 engaging social media captions with hashtags.
    - "imagePrompts": An array of 4 detailed, descriptive prompts for creating lifestyle photos of this product. Add "photorealistic, professional photography" to each prompt.
    Output ONLY the raw JSON object.
    """
    product_image = {'mime_type': 'image/jpeg', 'data': image_bytes}
    response = model.generate_content([prompt, product_image])

    try:
        raw_text = response.text
        json_string = raw_text.strip().lstrip("```json").rstrip("```").strip()
        return json.loads(json_string)
    except (json.JSONDecodeError, IndexError) as e:
        print(f"Error decoding JSON from Gemini: {e}")
        raise ValueError("Failed to get a valid JSON response from the AI. Please try again.")

def call_stabilityai_for_images(prompts: list):
    # --- THIS IS THE LINE THAT WAS FIXED ---
    IMAGE_API_URL = "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image"
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {STABILITY_API_KEY}",
    }
    image_urls = []

    for prompt in prompts:
        body = {
            "steps": 40,
            "width": 1024,
            "height": 1024,
            "seed": 0,
            "cfg_scale": 5,
            "samples": 1,
            "text_prompts": [
                {"text": prompt, "weight": 1},
                {"text": "blurry, bad, disfigured, low quality, deformed", "weight": -1} # Negative prompt
            ],
        }
        
        try:
            response = requests.post(IMAGE_API_URL, headers=headers, json=body)
            response.raise_for_status()
            
            data = response.json()
            base64_data = data["artifacts"][0]["base64"]
            image_urls.append(f"data:image/png;base64,{base64_data}")

        except requests.RequestException as e:
            print(f"Stability AI API call failed: {e}")
            image_urls.append("https://placehold.co/600x400/ff0000/FFFFFF?text=Image+Failed")

    return image_urls

# --- API Endpoint ---
@app.post("/api/generate")
async def generate_assets(request: GenerationRequest):
    if not GOOGLE_API_KEY or not STABILITY_API_KEY:
        raise HTTPException(status_code=500, detail="API keys are not configured correctly on the server.")
    
    try:
        image_bytes = base64.b64decode(request.imageBase64)
        
        text_and_prompts_results = call_gemini_for_text_and_prompts(request.story, image_bytes)
        
        image_prompts = text_and_prompts_results.get("imagePrompts", [])
        if not image_prompts:
            raise ValueError("Gemini did not return any image prompts.")
            
        generated_urls = call_stabilityai_for_images(image_prompts)
        
        return {
            "textData": text_and_prompts_results,
            "imageUrls": generated_urls
        }
    except Exception as e:
        print(f"An error occurred in /api/generate: {e}")
        raise HTTPException(status_code=500, detail=str(e))