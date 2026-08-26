import asyncio
import logging
import os
from typing import Literal

import requests
from pydantic import BaseModel, Field

from src.models import AddressComponent, AddressValidationResult, GeocodeResult
from src.prompts import load_prompt
from src.services.google_genai_service import extract_output_from_genai
from src.utils import get_task_logger, is_english_text


class AddressValidator:
    """Google Maps Geocoding APIを使用した住所検証クラス"""

    def __init__(self, logger: logging.Logger):
        """
        初期化

        Args:
            task_id: タスクID（ログ記録用）
        """
        self.logger = logger
        self.api_key = os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("GOOGLE_CLOUD_API_KEY")

        if not self.api_key:
            self.logger.warning("Google Maps API key not found in environment variables")

    def create_google_map_url(self, expected, actual=None) -> str:
        import urllib.parse

        if actual:
            # 住所から機関への経路を表示
            start_lat = expected.location["lat"]
            start_lng = expected.location["lng"]
            end_lat = actual.location["lat"]
            end_lng = actual.location["lng"]

            # 基本的な経路表示URL（デフォルトズームレベル14z = 半径約2km）
            return (
                f"https://www.google.com/maps/dir/"
                f"{start_lat},{start_lng}/"
                f"{end_lat},{end_lng}/"
                f"@{start_lat},{start_lng},18z"
            )
        # 機関の情報がない場合は住所のみをplace形ki式で表示
        addr_lat = expected.location["lat"]
        addr_lng = expected.location["lng"]
        place_id = expected.place_id
        formatted_address = expected.formatted_address

        # 住所をURLエンコード
        encoded_address = urllib.parse.quote(formatted_address, safe="")

        # data=パラメータの構造を生成
        # !4m10 = メタデータ（タイプと長さ）
        # !1m2!2m1!1z[encoded_address] = 検索クエリ
        # !3m6!1s[place_id] = Place ID
        # !8m2!3d[lat]!4d[lng] = 座標情報
        zoom_level = "17z"  # デフォルトのズームレベル

        data_param = f"!4m10!1m2!2m1!1z{encoded_address}!3m6!1s{place_id}!8m2!3d{addr_lat}!4d{addr_lng}"

        return (
            f"https://www.google.com/maps/place/{encoded_address}/@{addr_lat},{addr_lng},{zoom_level}/data={data_param}"
        )

    async def validate_address(
        self, address: str, organization_name_jp: str | None = None, organization_name_en: str | None = None
    ) -> AddressValidationResult:
        self.logger.info("住所検証を開始: %s", address)

        geocode_results = await self._geocode_address(address)

        if not geocode_results:
            return AddressValidationResult(
                address_exists=False,
                country_code=None,
                formatted_address=None,
                organization_match=None,
                organization_distance_km=None,
                address_geocode=None,
                organization_geocode=None,
                google_map_urls=[],
                message="住所の実在が確認できませんでした",
            )

        organization_name = organization_name_jp or organization_name_en

        # 最も信頼性の高い結果を選択
        best_result = self._select_best_result(geocode_results)
        country_code = best_result.country_code

        prompt = load_prompt(
            "address_organization_match.txt",
            organization_name=organization_name,
            address=address,
        )

        class AddressSearchResult(BaseModel):
            address_match: Literal["一致", "関連あり", "不一致"] | None = Field(
                None,
                description="住所と所属機関の関係性（一致/関連あり/不一致）",
            )
            reason: str | None = Field(None, description="判定の理由（日本語）")
            location_url: str | None = Field(None, description="住所の位置を示すGoogle MapsのURL（存在する場合）")

        result, reference_urls = await extract_output_from_genai(
            prompt, AddressSearchResult, grounding_type="map", logger=self.logger
        )

        return AddressValidationResult(
            address_exists=True,
            in_english=is_english_text(address),
            country_code=country_code,
            formatted_address=best_result.formatted_address,
            organization_match=result.address_match,
            organization_distance_km=None,
            address_geocode=best_result,
            organization_geocode=None,
            google_map_urls=[(result.location_url, organization_name, "")] if result.location_url else [],
            message=result.reason
            or ("住所の実在が確認されました" if result.is_valid else "住所の実在が確認できませんでした"),
        )

    async def _geocode_address(self, address: str) -> list[GeocodeResult]:
        """
        Google Geocoding APIを使用して住所をジオコード

        Args:
            address: ジオコードする住所

        Returns:
            List[GeocodeResult]: ジオコード結果のリスト
        """
        if not self.api_key:
            self.logger.error("Google Maps API key not available")
            return []

        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {"address": address, "key": self.api_key, "language": "ja"}

        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            if data["status"] != "OK":
                status = data.get("status", "Unknown error")
                self.logger.warning("Geocoding API error: %s", status)
                return []

            results = []
            for result in data.get("results", []):
                # 住所コンポーネントの解析
                components = []
                country_code = "UNKNOWN"

                for component in result.get("address_components", []):
                    components.append(
                        AddressComponent(
                            long_name=component["long_name"],
                            short_name=component["short_name"],
                            types=component["types"],
                        )
                    )

                    # 国コードの抽出
                    if "country" in component["types"]:
                        country_code = component["short_name"]

                geocode_result = GeocodeResult(
                    formatted_address=result["formatted_address"],
                    components=components,
                    location=result["geometry"]["location"],
                    location_type=result["geometry"]["location_type"],
                    place_id=result["place_id"],
                    country_code=country_code,
                )
                results.append(geocode_result)

            self.logger.info("ジオコード結果: %d件", len(results))
            return results

        except requests.RequestException:
            self.logger.exception("Geocoding API request failed")
            return []
        except (ValueError, KeyError):
            self.logger.exception("Geocoding error")
            return []

    def _select_best_result(self, results: list[GeocodeResult]) -> GeocodeResult:
        """
        最も信頼性の高いジオコード結果を選択

        Args:
            results: ジオコード結果のリスト

        Returns:
            GeocodeResult: 最も信頼性の高い結果
        """
        if not results:
            raise ValueError("No results to select from")

        # location_typeによる優先順位付け
        priority_order = {
            "ROOFTOP": 4,  # 最高精度
            "RANGE_INTERPOLATED": 3,  # 高精度
            "GEOMETRIC_CENTER": 2,  # 中精度
            "APPROXIMATE": 1,  # 低精度
        }

        best_result = max(results, key=lambda x: priority_order.get(x.location_type, 0))

        return best_result


if __name__ == "__main__":
    # テスト用のコード
    async def main():
        import sys

        validator = AddressValidator(get_task_logger(None))
        result = await validator.validate_address(
            sys.argv[1],
            organization_name_jp=sys.argv[2] if len(sys.argv) > 2 else None,
        )
        print(result)

    asyncio.run(main())
