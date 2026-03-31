"""
Baselinker API klient
Dokumentace: https://api.baselinker.com/
"""
import aiohttp
import asyncio
import json
from typing import Any, Optional
from decimal import Decimal


BASELINKER_API_URL = "https://api.baselinker.com/connector.php"


class BaselinkerError(Exception):
    pass


class BaselinkerClient:
    def __init__(self, token: str):
        self.token = token

    async def _call(self, method: str, parameters: dict = None) -> dict:
        """Zavolá Baselinker API metodu."""
        data = {
            "method": method,
            "parameters": json.dumps(parameters or {}),
        }
        headers = {"X-BLToken": self.token}

        async with aiohttp.ClientSession() as session:
            async with session.post(BASELINKER_API_URL, data=data, headers=headers) as resp:
                if resp.status != 200:
                    raise BaselinkerError(f"HTTP {resp.status}")
                result = await resp.json(content_type=None)

        if result.get("status") == "ERROR":
            raise BaselinkerError(result.get("error_message", "Neznámá chyba Baselinker API"))

        return result

    # ── Katalogy (inventáře) ──────────────────────────────────────────────────

    async def get_inventories(self) -> list[dict]:
        """Vrátí seznam katalogů (inventářů)."""
        result = await self._call("getInventories")
        return result.get("inventories", [])

    async def get_price_groups(self, inventory_id: int) -> list[dict]:
        """Vrátí cenové skupiny pro daný katalog."""
        result = await self._call("getInventoryPriceGroups", {"inventory_id": inventory_id})
        return result.get("price_groups", [])

    # ── Produkty ──────────────────────────────────────────────────────────────

    async def get_products_list(self, inventory_id: int, page: int = 1, filter_ean: str = None, filter_sku: str = None) -> dict:
        """Vrátí seznam produktů (max 1000/stránka)."""
        params: dict = {"inventory_id": inventory_id, "page": page}
        if filter_ean:
            params["filter_ean"] = filter_ean
        if filter_sku:
            params["filter_sku"] = filter_sku
        return await self._call("getInventoryProductsList", params)

    async def get_products_data(self, inventory_id: int, product_ids: list[int]) -> dict:
        """Vrátí plná data pro konkrétní produkty."""
        result = await self._call("getInventoryProductsData", {
            "inventory_id": inventory_id,
            "products": product_ids,
        })
        return result.get("products", {})

    async def get_products_prices(self, inventory_id: int, page: int = 1) -> dict:
        """Vrátí ceny všech produktů v katalogu (max 1000/stránka)."""
        result = await self._call("getInventoryProductsPrices", {
            "inventory_id": inventory_id,
            "page": page,
        })
        return result.get("products", {})

    async def get_all_products(self, inventory_id: int) -> list[dict]:
        """Stáhne všechny produkty z katalogu (stránkování automaticky)."""
        all_products = []
        page = 1
        while True:
            result = await self._call("getInventoryProductsList", {
                "inventory_id": inventory_id,
                "page": page,
            })
            products = result.get("products", {})
            if not products:
                break
            for product_id, product in products.items():
                product["baselinker_id"] = int(product_id)
                all_products.append(product)
            if len(products) < 1000:
                break
            page += 1
            await asyncio.sleep(0.1)  # rate limit: 100 req/min
        return all_products

    # ── Ceny ──────────────────────────────────────────────────────────────────

    async def update_prices(self, inventory_id: int, prices: dict[int, dict[int, float]]) -> dict:
        """
        Aktualizuje ceny produktů v Baselinker.

        prices = {
            baselinker_product_id: {
                price_group_id: price,
                ...
            },
            ...
        }
        Max 1000 produktů na volání.
        """
        # Rozděl na dávky po 1000
        items = list(prices.items())
        results = {"counter": 0, "warnings": {}}

        for i in range(0, len(items), 1000):
            batch = dict(items[i:i + 1000])
            result = await self._call("updateInventoryProductsPrices", {
                "inventory_id": inventory_id,
                "products": {str(k): v for k, v in batch.items()},
            })
            results["counter"] += result.get("counter", 0)
            results["warnings"].update(result.get("warnings", {}))
            if len(items) > 1000:
                await asyncio.sleep(0.6)  # rate limit

        return results

    async def find_product_by_ean(self, inventory_id: int, ean: str) -> Optional[dict]:
        """Najde produkt podle EAN."""
        result = await self._call("getInventoryProductsList", {
            "inventory_id": inventory_id,
            "filter_ean": ean,
        })
        products = result.get("products", {})
        if products:
            product_id, product = next(iter(products.items()))
            product["baselinker_id"] = int(product_id)
            return product
        return None

    async def find_product_by_sku(self, inventory_id: int, sku: str) -> Optional[dict]:
        """Najde produkt podle SKU."""
        result = await self._call("getInventoryProductsList", {
            "inventory_id": inventory_id,
            "filter_sku": sku,
        })
        products = result.get("products", {})
        if products:
            product_id, product = next(iter(products.items()))
            product["baselinker_id"] = int(product_id)
            return product
        return None

    async def test_connection(self) -> dict:
        """Otestuje připojení a vrátí seznam katalogů."""
        inventories = await self.get_inventories()
        return {
            "ok": True,
            "inventories_count": len(inventories),
            "inventories": inventories[:5],
        }
