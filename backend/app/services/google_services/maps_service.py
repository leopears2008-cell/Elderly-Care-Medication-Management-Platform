"""
Google Maps Places & Emergency Navigation Service — SushrutaCare AI
Generates senior-friendly deep-links to locate nearby 24/7 pharmacies,
emergency hospitals, and diagnostic labs.
"""

import urllib.parse
from typing import Dict, List, Optional


class GoogleMapsEmergencyService:
    BASE_SEARCH_URL = "https://www.google.com/maps/search/"
    BASE_DIR_URL = "https://www.google.com/maps/dir/"

    @classmethod
    def find_nearby_pharmacies_url(
        cls,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        query: str = "24/7 pharmacy chemist medical store",
    ) -> str:
        """
        Builds a Google Maps search URL prioritizing 24-hour pharmacies near the senior.
        """
        if latitude is not None and longitude is not None:
            params = {"api": "1", "query": query, "query_place_id": f"{latitude},{longitude}"}
        else:
            params = {"api": "1", "query": query}
        return f"{cls.BASE_SEARCH_URL}?{urllib.parse.urlencode(params)}"

    @classmethod
    def find_nearby_hospitals_url(
        cls,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        query: str = "emergency hospital casualty clinic",
    ) -> str:
        """
        Builds an urgent emergency hospital locator URL.
        """
        if latitude is not None and longitude is not None:
            params = {"api": "1", "query": query, "query_place_id": f"{latitude},{longitude}"}
        else:
            params = {"api": "1", "query": query}
        return f"{cls.BASE_SEARCH_URL}?{urllib.parse.urlencode(params)}"

    @classmethod
    def get_emergency_directions_url(
        cls,
        destination_hospital: str,
        origin_lat: Optional[float] = None,
        origin_lng: Optional[float] = None,
    ) -> str:
        """
        Builds direct navigation turn-by-turn routing for emergency vehicles or family members.
        """
        params = {"api": "1", "destination": destination_hospital, "travelmode": "driving"}
        if origin_lat is not None and origin_lng is not None:
            params["origin"] = f"{origin_lat},{origin_lng}"
        return f"{cls.BASE_DIR_URL}?{urllib.parse.urlencode(params)}"
