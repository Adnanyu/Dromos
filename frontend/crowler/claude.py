#!/usr/bin/env python3
"""
Airbnb FIFA World Cup 2026 Free Ticket Crawler
Searches each city/round, scrapes listings, flags ones with free ticket perk.
"""

import asyncio
import json
import re
import sys
from datetime import datetime
from playwright.async_api import async_playwright

STAGES = [
    {
        "round": "Group Stage / KO Round of 32",
        "book_from": "2026-06-10",
        "cities": [
            ("Los Angeles", "2026-06-20", "2026-07-01"),
            ("Boston", "2026-06-20", "2026-07-01"),
            ("Monterrey", "2026-06-12", "2026-06-26"),
            ("New York", "2026-06-12", "2026-06-26"),
            ("Mexico City", "2026-06-12", "2026-06-26"),
            ("San Francisco", "2026-06-13", "2026-06-27"),
            ("Seattle", "2026-06-13", "2026-06-27"),
            ("Vancouver", "2026-06-13", "2026-06-27"),
            ("Kansas City", "2026-06-14", "2026-06-28"),
            ("Dallas", "2026-06-14", "2026-06-28"),
            ("Philadelphia", "2026-06-14", "2026-06-28"),
            ("Houston", "2026-06-14", "2026-06-28"),
            ("Miami", "2026-06-15", "2026-06-29"),
            ("Atlanta", "2026-06-15", "2026-06-29"),
        ],
    },
    {
        "round": "Round of 16",
        "book_from": "2026-06-18",
        "cities": [
            ("Philadelphia", "2026-06-28", "2026-07-02"),
            ("Houston", "2026-06-28", "2026-07-02"),
            ("New York", "2026-06-29", "2026-07-03"),
            ("Mexico City", "2026-06-29", "2026-07-03"),
            ("Dallas", "2026-06-30", "2026-07-04"),
            ("Seattle", "2026-06-30", "2026-07-04"),
        ],
    },
    {
        "round": "Quarter Finals",
        "book_from": "2026-07-01",
        "cities": [
            ("Boston", "2026-07-04", "2026-07-07"),
            ("Los Angeles", "2026-07-05", "2026-07-08"),
            ("Miami", "2026-07-05", "2026-07-08"),
            ("Kansas City", "2026-07-06", "2026-07-09"),
        ],
    },
    {
        "round": "Semi Finals",
        "book_from": "2026-07-09",
        "cities": [
            ("Dallas", "2026-07-14", "2026-07-16"),
            ("Atlanta", "2026-07-15", "2026-07-17"),
        ],
    },
    {
        "round": "Final",
        "book_from": "2026-07-16",
        "cities": [
            ("New York", "2026-07-19", "2026-07-21"),
        ],
    },
]

TICKET_KEYWORDS = [
    "free fifa world cup",
    "Self check-in",
    "world cup ticket",
    "free ticket",
    "fifa ticket",
    "world cup 2026™",
    "attend a match",
    "soccer ball",   # alt-text fallback
]

def build_search_url(city: str, checkin: str, checkout: str) -> str:
    city_enc = city.replace(" ", "%20")
    return (
        f"https://www.airbnb.com/s/{city_enc}--United-States/homes"
        f"?checkin={checkin}&checkout={checkout}&adults=2&tab_id=home_tab"
        f"&refinement_paths%5B%5D=%2Fhomes&search_type=filter_change"
    )

def has_ticket_perk(text: str) -> bool:
    low = text.lower()
    return any(kw in low for kw in TICKET_KEYWORDS)

async def scrape_search_page(page, url: str, city: str, round_name: str):
    """Load a search results page and return listings with ticket perk."""
    results = []
    print(f"  → Searching {city} ... ", end="", flush=True)
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3500)  # let JS render

        # Scroll to load lazy images/text
        for _ in range(3):
            await page.evaluate("window.scrollBy(0, 800)")
            await page.wait_for_timeout(600)

        # Grab all listing cards
        cards = await page.query_selector_all('[itemprop="itemListElement"], [data-testid="card-container"], div[class*="g1qv1ctd"]')

        if not cards:
            # Fallback: grab any anchor that looks like a listing
            cards = await page.query_selector_all('a[href*="/rooms/"]')

        found = 0
        for card in cards:
            try:
                card_text = await card.inner_text()
                card_html = await card.inner_html()
                href = await card.get_attribute("href") or ""

                # If the card itself isn't an <a>, find the listing link inside
                if not href or "/rooms/" not in href:
                    link_el = await card.query_selector('a[href*="/rooms/"]')
                    if link_el:
                        href = await link_el.get_attribute("href") or ""

                if has_ticket_perk(card_text) or has_ticket_perk(card_html):
                    if href:
                        full_url = href if href.startswith("http") else f"https://www.airbnb.com{href}"
                        # Clean up URL query params to get canonical listing URL
                        base = full_url.split("?")[0]
                        results.append({
                            "round": round_name,
                            "city": city,
                            "url": base,
                            "snippet": card_text[:200].replace("\n", " ").strip(),
                        })
                        found += 1
            except Exception:
                continue

        print(f"{found} listings with free tickets found")

        # Also check if the whole page has a "no results" signal
        page_text = await page.inner_text("body")
        if "no results" in page_text.lower() or "0 stays" in page_text.lower():
            print(f"    ⚠ Page indicates no results for {city}")

    except Exception as e:
        print(f"ERROR: {e}")

    return results


async def crawl_individual_listing(page, listing: dict) -> dict:
    """Visit a listing page to confirm and enrich ticket details."""
    try:
        await page.goto(listing["url"], wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(2000)
        body = await page.inner_text("body")
        if has_ticket_perk(body):
            # Try to grab listing title
            title_el = await page.query_selector('h1, [data-testid="listing-title"]')
            title = (await title_el.inner_text()).strip() if title_el else "Unknown listing"

            # Try price
            price_el = await page.query_selector('[data-testid="price-and-discounted-price"], span[class*="a8jt5op"]')
            price = (await price_el.inner_text()).strip() if price_el else "See site"

            listing["title"] = title
            listing["price"] = price
            listing["confirmed"] = True
        else:
            listing["confirmed"] = False
    except Exception as e:
        listing["confirmed"] = False
        listing["error"] = str(e)
    return listing


async def main():
    all_found = []
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="en-US",
        )
        page = await context.new_page()

        # Block images/fonts to speed up crawl
        await page.route("**/*.{png,jpg,jpeg,gif,webp,woff,woff2,ttf,svg}", lambda r: r.abort())

        for stage in STAGES:
            print(f"\n{'='*60}")
            print(f"Round: {stage['round']}  (bookable from {stage['book_from']})")
            print(f"{'='*60}")
            for city, checkin, checkout in stage["cities"]:
                url = build_search_url(city, checkin, checkout)
                listings = await scrape_search_page(page, url, city, stage["round"])
                all_found.extend(listings)
                await asyncio.sleep(1.5)  # polite delay

        # Confirm listings by visiting each one
        if all_found:
            print(f"\n{'='*60}")
            print(f"Confirming {len(all_found)} candidate listings...")
            print(f"{'='*60}")
            confirmed = []
            for listing in all_found:
                print(f"  Checking: {listing['url'][:70]}...")
                enriched = await crawl_individual_listing(page, listing)
                if enriched.get("confirmed"):
                    confirmed.append(enriched)
                    print(f"    ✓ CONFIRMED: {enriched.get('title', 'N/A')}")
                else:
                    print(f"    ✗ Not confirmed on listing page")
                await asyncio.sleep(1)
        else:
            confirmed = []

        await browser.close()

    # Output results
    print(f"\n{'='*60}")
    print(f"RESULTS — Airbnb World Cup Free Ticket Listings")
    print(f"Crawled at: {timestamp}")
    print(f"{'='*60}")

    if not confirmed:
        print("\nNo confirmed listings found with free World Cup tickets.")
        print("This could mean:")
        print("  1. Airbnb is blocking the crawler (most likely)")
        print("  2. No tickets available for the searched dates yet")
        print("  3. The perk text isn't in a crawlable DOM element (rendered in canvas/image)")
    else:
        by_round = {}
        for item in confirmed:
            by_round.setdefault(item["round"], []).append(item)

        for round_name, items in by_round.items():
            print(f"\n[ {round_name} ]")
            for item in items:
                print(f"  City   : {item['city']}")
                print(f"  Title  : {item.get('title', 'N/A')}")
                print(f"  Price  : {item.get('price', 'N/A')}")
                print(f"  URL    : {item['url']}")
                print()

    # Save JSON
    output = {
        "crawled_at": timestamp,
        "total_found": len(confirmed),
        "listings": confirmed,
    }
    with open("/mnt/user-data/outputs/wc_ticket_listings.json", "w") as f:
        json.dump(output, f, indent=2)

    # Save readable text report
    with open("/mnt/user-data/outputs/wc_ticket_listings.txt", "w") as f:
        f.write(f"FIFA World Cup 2026 — Airbnb Free Ticket Listings\n")
        f.write(f"Crawled at: {timestamp}\n")
        f.write(f"Total confirmed: {len(confirmed)}\n\n")
        if confirmed:
            for item in confirmed:
                f.write(f"Round : {item['round']}\n")
                f.write(f"City  : {item['city']}\n")
                f.write(f"Title : {item.get('title', 'N/A')}\n")
                f.write(f"Price : {item.get('price', 'N/A')}\n")
                f.write(f"URL   : {item['url']}\n\n")
        else:
            f.write("No confirmed listings found.\n")

    print(f"\nSaved: /mnt/user-data/outputs/wc_ticket_listings.json")
    print(f"Saved: /mnt/user-data/outputs/wc_ticket_listings.txt")
    return len(confirmed)


if __name__ == "__main__":
    asyncio.run(main())