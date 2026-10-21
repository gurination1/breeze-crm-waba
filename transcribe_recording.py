import os
import sys
import json
import time
import requests

API_KEYS = [
    "AQ.Ab8RN6KuhP1vOLQwD-QgE8KP4H1eWxXYMuQpuJ4or6biVi7pIQ",
    "AQ.Ab8RN6IeJS5T_8N2BA-VpdlU14YVOudPRxHpsNCetFBNiRVwRQ",
    "AQ.Ab8RN6L0tfBTUC2RxdaOSCC-ztWTiiMSbcLS_bwqxtXju9qVew",
    "AQ.Ab8RN6LOSvw-zxR966kZ8BLVdNpL2SVUKIVRg4pFQyAEmvJmeg",
    "AQ.Ab8RN6KDlOI_W1_dzVBfLcD8CcNC-R468VG_ggb6WlSDQmXCDg",
    "AQ.Ab8RN6LjNA2q2JY8RG-2_ZSffhRl2bZUzES8VurZmp913TRsQw",
    "AQ.Ab8RN6Ko0wttJP8Se0f6BLQDf6gPqYsiHxsDHEjzIzSLcwBlIg",
    "AQ.Ab8RN6KJPUA_JfUJLRI54JC64LCi6_D8JYQheFN5S4qkHccZNQ",
    "AQ.Ab8RN6KjISnZ9U9UVypdPt36oFb-reL783PG8UyV-FfrPXC9Rg",
    "AQ.Ab8RN6IF3wYCEaTwLvmRjCVttRp1MkoV9W8fKbGueS5guUhCow",
    "AQ.Ab8RN6Inlsrl8Xvu_ooqYjEiWQ4fIksPaZlSqJws8ym04y7y8g",
    "AQ.Ab8RN6KfymaYVTWj0KhpwBuLQ9xSF0SBeDxSDljrdaNVMBDInw",
    "AQ.Ab8RN6LuIk5nC87yxAd41EeiqGsOSDvLhuiW6AQJ2ADz_T0YEw",
    "AQ.Ab8RN6K7aC0SkDNWcIrbD7iQrehDjxL2Vs4QyAARO959k2Qvcg"
]

AUDIO_FILE = "/root/enterprise-waba-ai/data/audio/charansir_opt.mp3"

def upload_and_transcribe(key):
    print(f"[*] Trying Gemini key {key[:12]}...")
    file_size = os.path.getsize(AUDIO_FILE)
    
    # 1. Resumable Upload Handshake
    headers = {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(file_size),
        "X-Goog-Upload-Header-Content-Type": "audio/mp3",
        "Content-Type": "application/json"
    }
    init_res = requests.post(
        f"https://generativelanguage.googleapis.com/upload/v1beta/files?key={key}",
        headers=headers,
        json={"file": {"display_name": "charansir_recording"}},
        timeout=30
    )
    if init_res.status_code != 200:
        raise Exception(f"Init upload failed: {init_res.status_code} {init_res.text}")
    
    upload_url = init_res.headers.get("X-Goog-Upload-URL")
    if not upload_url:
        raise Exception("No X-Goog-Upload-URL returned")
    
    print("[*] Uploading audio bytes to Gemini File API...")
    with open(AUDIO_FILE, "rb") as f:
        audio_data = f.read()
    
    upload_res = requests.post(
        upload_url,
        headers={
            "Content-Length": str(file_size),
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize"
        },
        data=audio_data,
        timeout=120
    )
    if upload_res.status_code != 200:
        raise Exception(f"Byte upload failed: {upload_res.status_code} {upload_res.text}")
    
    file_info = upload_res.json().get("file", {})
    file_uri = file_info.get("uri")
    file_name = file_info.get("name")
    print(f"[+] File uploaded successfully! URI: {file_uri}, Name: {file_name}")
    
    # Wait until ACTIVE
    for _ in range(30):
        check_res = requests.get(f"https://generativelanguage.googleapis.com/v1beta/{file_name}?key={key}")
        state = check_res.json().get("state")
        print(f"[*] File state: {state}")
        if state == "ACTIVE":
            break
        time.sleep(3)
    
    # Generate Transcription & Deep Analysis
    prompt = """
You are an expert sales analyst, psychologist, and professional transcriber.
This is an authentic 30-minute business sales conversation / call recording for CP SYSTEM (Cool & Pure System, Muktsar), discussing industrial machinery (RO Plants, Industrial Chillers, BMC Milk Chillers, Commercial Heat Pumps, Dairy equipment, Pricing, Quotes, Objections).

Please provide:
1. FULL VERBATIM TRANSCRIPTION:
Transcribe the entire recording with timestamps and speaker labels (Speaker 1, Speaker 2, etc.), capturing the exact words, Punjabi/Hindi/English colloquial terms, emotional nuances, hesitations, questions asked, and answers given.

2. DEEP DISSECTION & PSYCHOLOGICAL SALES BREAKDOWN:
- Customer Identity, Business Context & Pain Points: Who is the caller? What is their exact dairy / factory / business situation? What problem are they trying to solve?
- Buying Triggers & Emotional Stakes: What motivates them? What are they afraid of (loss of milk, electricity bills, plant downtime, breakdown)?
- Objections & Hesitations Raised: Pricing questions, trust, delivery timeline, installation doubts, technical specs.
- How the Seller Handled It: What worked? What created instant rapport? What tone did the seller use?
- Tone & Persona Secrets: How does the seller sound (elder brother, expert consultant, grounded local tradesman, not an annoying corporate salesman)?
- Ads Pipeline Optimization Blueprint: When customers come from Facebook/Instagram/Google Ads into WhatsApp, what is the exact script, psychological pacing, and conversational flow that will make them feel instantly understood and eager to buy?

Output your response cleanly in Markdown.
"""

    print("[*] Generating transcription and analysis with Gemini 2.5 Flash...")
    gen_res = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}",
        headers={"Content-Type": "application/json"},
        json={
            "contents": [
                {
                    "parts": [
                        {"file_data": {"mime_type": "audio/mp3", "file_uri": file_uri}},
                        {"text": prompt}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 8192
            }
        },
        timeout=180
    )
    if gen_res.status_code != 200:
        raise Exception(f"Generation failed: {gen_res.status_code} {gen_res.text}")
    
    content = gen_res.json()["candidates"][0]["content"]["parts"][0]["text"]
    return content

for key in API_KEYS:
    try:
        result = upload_and_transcribe(key)
        out_path = "/root/enterprise-waba-ai/data/charansir_transcription_and_sales_analysis.md"
        with open(out_path, "w", encoding="utf-8") as out_f:
            out_f.write(result)
        print(f"✅ Success! Written to {out_path}")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Key failed: {e}")

print("All keys failed.")
sys.exit(1)
