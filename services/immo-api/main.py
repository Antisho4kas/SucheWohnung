from fastapi import FastAPI, Query
import json
import re
import uvicorn
from playwright.sync_api import sync_playwright

app = FastAPI(title="ImmoSpider API", version="1.0")

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/search")
def search(
    city: str = Query("Ingolstadt"),
    max_price: int = Query(800),
    min_rooms: float = Query(1.5),
    pages: int = Query(2),
):
    results = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=USER_AGENT)
        
        for page_num in range(1, pages + 1):
            try:
                url = f"https://www.immobilienscout24.de/Suche/S-T/Wohnung-Miete/Bayern/{city}/{city}/{min_rooms},00-/-/EURO--{max_price},00?pagenumber={page_num}"
                page = context.new_page()
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                html = page.content()
                page.close()
                
                # Extract resultListModel JSON
                json_match = re.search(r'resultListModel\s*:\s*(\{.*?\});\s*\n', html, re.DOTALL)
                if not json_match:
                    continue
                
                data = json.loads(json_match.group(1))
                entries = (data.get("searchResponseModel", {})
                           .get("resultlist.resultlist", {})
                           .get("resultlistEntries", [{}])[0]
                           .get("resultlistEntry", []))
                
                if isinstance(entries, dict):
                    entries = [entries]
                
                for entry in entries:
                    re_data = entry.get("resultlist.realEstate", {})
                    if not re_data:
                        continue
                    
                    addr = re_data.get("address", {})
                    price_data = re_data.get("price", {})
                    
                    listing = {
                        "id": str(re_data.get("@id", "")),
                        "url": f"https://www.immobilienscout24.de/expose/{re_data.get('@id', '')}",
                        "title": re_data.get("title", ""),
                        "price": price_data.get("value", 0),
                        "area": re_data.get("livingSpace", 0),
                        "rooms": re_data.get("numberOfRooms", 0),
                        "city": addr.get("city", city),
                        "postalCode": addr.get("postcode", ""),
                        "district": addr.get("quarter", ""),
                        "street": f"{addr.get('street', '')} {addr.get('houseNumber', '')}".strip(),
                    }
                    results.append(listing)
                    
            except Exception as e:
                print(f"Page {page_num} error: {e}")
        
        browser.close()
    
    seen = set()
    unique = [r for r in results if r["id"] not in seen and not seen.add(r["id"])]
    return {"success": True, "results": unique, "count": len(unique)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
