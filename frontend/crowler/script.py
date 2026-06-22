import asyncio
import json
import re
from datetime import datetime

import pandas as pd
from playwright.async_api import async_playwright


# ==========================================
# CONFIG
# ==========================================

MAX_CONCURRENT_LISTINGS = 10

SEARCH_WINDOWS = [
    ("2026-06-10", "2026-06-17"),
    ("2026-06-18", "2026-06-30"),
    ("2026-07-01", "2026-07-08"),
    ("2026-07-09", "2026-07-15"),
    ("2026-07-16", "2026-07-20"),
]

CITIES = [
    "Atlanta",
    "Boston",
    "Dallas",
    "Guadalajara",
    "Houston",
    "Kansas City",
    "Los Angeles",
    "Mexico City",
    "Monterrey",
    "New York",
    "Philadelphia",
    "San Francisco",
    "Seattle",
    "Toronto",
    "Vancouver",
    "Miami",
]

KEYWORDS = [
    "free fifa world cup 2026",
    "free fifa world cup",
    "free world cup tickets",
    "world cup tickets",
    "tickets included",
    "attend a match during your stay",
    "fifa world cup 2026",
]


# ==========================================
# HELPERS
# ==========================================

def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


async def safe_get_text(page):
    try:
        return normalize(await page.locator("body").inner_text())
    except Exception:
        return ""


# ==========================================
# LISTING DETECTION
# ==========================================

async def listing_has_fifa_offer(page, url):
    try:
        await page.goto(
            url,
            wait_until="networkidle",
            timeout=60000
        )

        text = await safe_get_text(page)

        for keyword in KEYWORDS:
            if keyword in text:
                return True

        selectors = [
            'text="Attend a match during your stay"',
            'text="Free FIFA World Cup"',
            'text="World Cup"',
            'text="tickets included"',
        ]

        for selector in selectors:
            try:
                count = await page.locator(selector).count()
                if count > 0:
                    return True
            except Exception:
                pass

        return False

    except Exception as e:
        print(f"ERROR listing check: {url}")
        print(e)
        return False


# ==========================================
# URL COLLECTION
# ==========================================

async def collect_listing_urls(page):
    urls = set()

    try:
        anchors = await page.locator('a[href*="/rooms/"]').evaluate_all(
            """
            els => els.map(e => e.href)
            """
        )

        for url in anchors:
            if "/rooms/" not in url:
                continue

            clean = url.split("?")[0]
            urls.add(clean)

    except Exception:
        pass

    return list(urls)


async def collect_all_pages(page):
    all_urls = set()

    while True:

        await page.wait_for_timeout(3000)

        urls = await collect_listing_urls(page)

        all_urls.update(urls)

        try:
            next_button = page.locator(
                'a[aria-label*="Next"]'
            )

            if await next_button.count() == 0:
                break

            await next_button.first.click()

            await page.wait_for_load_state("networkidle")

        except Exception:
            break

    return list(all_urls)


# ==========================================
# SEARCH CITY
# ==========================================

async def search_city(browser, city, checkin, checkout):

    print(
        f"\nSEARCHING: {city} "
        f"{checkin} -> {checkout}"
    )

    page = await browser.new_page()

    search_url = (
        f"https://www.airbnb.com/s/"
        f"{city}/homes"
        f"?checkin={checkin}"
        f"&checkout={checkout}"
        f"&adults=2"
    )

    try:
        await page.goto(
            search_url,
            wait_until="networkidle",
            timeout=60000
        )

        await page.wait_for_timeout(5000)

        urls = await collect_all_pages(page)

        print(
            f"{city}: collected "
            f"{len(urls)} listings"
        )

    except Exception as e:
        print("SEARCH ERROR:", city, e)
        await page.close()
        return []

    await page.close()

    semaphore = asyncio.Semaphore(
        MAX_CONCURRENT_LISTINGS
    )

    results = []

    async def worker(url):

        async with semaphore:

            p = await browser.new_page()

            try:

                found = await listing_has_fifa_offer(
                    p,
                    url
                )

                if found:

                    print(
                        f"FOUND FIFA OFFER: {url}"
                    )

                    results.append(
                        {
                            "city": city,
                            "checkin": checkin,
                            "checkout": checkout,
                            "url": url,
                        }
                    )

            finally:
                await p.close()

    tasks = [
        asyncio.create_task(worker(url))
        for url in urls
    ]

    await asyncio.gather(*tasks)

    return results


# ==========================================
# MAIN
# ==========================================

async def main():

    started = datetime.now()

    all_matches = []

    async with async_playwright() as p:

        browser = await p.chromium.launch(
            headless=False,
            slow_mo=50,
        )

        for city in CITIES:

            for checkin, checkout in SEARCH_WINDOWS:

                matches = await search_city(
                    browser,
                    city,
                    checkin,
                    checkout,
                )

                all_matches.extend(matches)

        await browser.close()

    df = pd.DataFrame(all_matches)

    df.to_csv(
        "airbnb_fifa_ticket_listings.csv",
        index=False,
    )

    with open(
        "airbnb_fifa_ticket_listings.json",
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            all_matches,
            f,
            indent=2,
            ensure_ascii=False,
        )

    print("\n===================================")
    print(f"FOUND {len(all_matches)} MATCHES")
    print("===================================")

    if len(all_matches):
        print(df)

    print(
        "\nElapsed:",
        datetime.now() - started,
    )


if __name__ == "__main__":
    asyncio.run(main())