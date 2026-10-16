import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from services.result_cache import configured_ttl, result_cache

load_dotenv()

def tavily_search(query: str, max_results: int = 5) -> dict:
    """Return evidence, never presentation-ready prose.

    Callers must keep source URLs and timestamps attached to any travel fact.
    """
    fetched_at = datetime.now(timezone.utc).isoformat()
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return {"success": False, "data": [], "source": "Tavily", "fetched_at": fetched_at,
                "error": "TAVILY_API_KEY is not configured"}
    def search() -> dict:
        try:
            # Keep Tavily's tiktoken/native extension out of application startup.
            from tavily import TavilyClient

            response = TavilyClient(api_key=api_key).search(query=query, max_results=max_results)
            data = [
                {
                    "title": item.get("title", "Untitled"),
                    "url": item.get("url"),
                    "snippet": item.get("content", "").strip(),
                    "published_date": item.get("published_date"),
                }
                for item in response.get("results", [])
            ]
            return {"success": True, "data": data, "source": "Tavily", "fetched_at": fetched_at, "error": None}
        except Exception as exc:
            return {"success": False, "data": [], "source": "Tavily", "fetched_at": fetched_at, "error": str(exc)}

    result, cache_hit = result_cache.get_or_load(
        "tavily-search", {"query": query.strip().casefold(), "max_results": max_results},
        ttl_seconds=configured_ttl("TAVILY_CACHE_TTL_SECONDS", 21600),
        loader=search,
        should_cache=lambda value: bool(value.get("success") and value.get("data")),
    )
    return {**result, "cache_hit": cache_hit}
