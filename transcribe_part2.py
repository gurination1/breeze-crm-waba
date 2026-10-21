import requests

API_KEY = "AQ.Ab8RN6KuhP1vOLQwD-QgE8KP4H1eWxXYMuQpuJ4or6biVi7pIQ"
FILE_URI = "https://generativelanguage.googleapis.com/v1beta/files/2dwzuzfivq4t"

prompt = """
You are analyzing the 30-minute audio of Charan Sir explaining the complete sales architecture, customer psychology, objections, pricing, and exact script flow for CP SYSTEM (Cool & Pure System, Muktsar).

The first 10 minutes were already transcribed. Now:
1. TRANSCRIBE FROM [00:10:00] TO THE END OF THE RECORDING:
Capture every word spoken by Charan Sir and the other speaker regarding:
- Chiller requirements (Milk chillers, BMC, industrial machine cooling, laser machines, injection molding, bakeries, chemical plants).
- RO & Bottling plant business economics (Camper cans, Rs 20 cans, marriage functions, soda plants, mineral water bottles).
- PMEGP Subsidy / Government Loan scheme hooks (how to explain 25-35% subsidy, Rs 2.5L to Rs 3.5L waiver, loan criteria).
- Village vs City customer psychology (pind vs shehar).
- Token money / Sai pauna (how to get the customer to pay advance token/sai to lock in price).
- How the bot should converse: friendly brotherly tone, genuine helper/well-wisher, not salesy or robotic.
- Follow-up sequence: Day 1 (Discovery & Quotation), Day 2 (Value / Subsidy Hook), Day 3 (Urgency / Token lock).

2. MASTER SALES DISSECTION & ACTIONABLE PROMPT BLUEPRINT:
Summarize all actionable rules, objections, pricing formulas, and conversation templates directly stated by Charan Sir.
"""

print("[*] Calling Gemini 2.5 Flash for Part 2 and Deep Blueprint...")
res = requests.post(
    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}",
    headers={"Content-Type": "application/json"},
    json={
        "contents": [
            {
                "parts": [
                    {"file_data": {"mime_type": "audio/mp3", "file_uri": FILE_URI}},
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

if res.status_code == 200:
    content = res.json()["candidates"][0]["content"]["parts"][0]["text"]
    with open("/root/enterprise-waba-ai/data/charansir_sales_blueprint_part2.md", "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ Part 2 & Master Blueprint written to /root/enterprise-waba-ai/data/charansir_sales_blueprint_part2.md")
else:
    print(f"Error: {res.status_code} {res.text}")
