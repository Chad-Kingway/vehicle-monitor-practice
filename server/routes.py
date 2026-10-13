import asyncio
from math import isfinite

import httpx

from .schemas import Position, RoadRoute, RouteQuery


DIRECTION_URL = "https://kwmap.localking.com.tw/maps/api/Directions/json"


class RouteError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def decode_polyline(encoded: str) -> list[Position]:
    # Encoded polyline 先緯度後經度，以 1e5 量化；輸出統一為 [經度, 緯度]。
    if not isinstance(encoded, str) or not encoded:
        raise ValueError("缺少 encoded polyline。")
    points = []
    offset = 0
    latitude = longitude = 0
    while offset < len(encoded):
        deltas = []
        for _ in range(2):
            value = shift = 0
            while True:
                if offset >= len(encoded) or shift > 30:
                    raise ValueError("encoded polyline 不完整。")
                byte = ord(encoded[offset]) - 63
                offset += 1
                if not 0 <= byte <= 63:
                    raise ValueError("encoded polyline 字元無效。")
                value |= (byte & 31) << shift
                shift += 5
                if byte < 32:
                    break
            deltas.append(~(value >> 1) if value & 1 else value >> 1)
        latitude += deltas[0]
        longitude += deltas[1]
        if abs(latitude) > 90 * 100000 or abs(longitude) > 180 * 100000:
            raise ValueError("encoded polyline 座標超出範圍。")
        points.append((longitude / 100000, latitude / 100000))
    return points


def near(first: Position, second: Position) -> bool:
    # 允許 polyline 量化與 step metadata 的約兩公尺誤差。
    return all(abs(a - b) <= 0.00002 for a, b in zip(first, second))


def location(value: dict) -> Position:
    point = (value["lng"], value["lat"])
    if not all(type(number) in (int, float) and isfinite(number) for number in point):
        raise ValueError("路線端點無效。")
    if abs(point[0]) > 180 or abs(point[1]) > 90:
        raise ValueError("路線端點超出範圍。")
    return point


def normalize_route(data: dict, query: RouteQuery) -> RoadRoute:
    route = data["routes"][0]
    legs = route["legs"]
    if not isinstance(legs, list) or not legs:
        raise ValueError("缺少道路路段。")
    coordinates = []
    distance = duration = 0
    for leg in legs:
        for field in ("distance", "duration"):
            number = leg[field]["value"]
            if type(number) not in (int, float) or not isfinite(number) or number < 0:
                raise ValueError("路線距離或時間無效。")
        distance += leg["distance"]["value"]
        duration += leg["duration"]["value"]
        steps = leg["steps"]
        if not isinstance(steps, list) or not steps:
            raise ValueError("缺少完整道路幾何。")
        for step in steps:
            points = decode_polyline(step["polyline"]["points"])
            if len(points) < 2:
                raise ValueError("道路步驟至少需要兩點。")
            if not near(points[0], location(step["start_location"])) or not near(
                points[-1], location(step["end_location"])
            ):
                raise ValueError("解碼座標不符合道路端點。")
            if coordinates and not near(coordinates[-1], points[0]):
                raise ValueError("道路步驟不連續，不能以直線補接。")
            for point in points:
                if not coordinates or coordinates[-1] != point:
                    coordinates.append(point)
    return RoadRoute(
        origin=query.origin, destination=query.destination, coordinates=coordinates,
        distance_meters=distance, duration_seconds=duration,
    )


class RoutePlanner:
    def __init__(self, client: httpx.AsyncClient, api_key: str, timeout: float, concurrency: int):
        self.client = client
        self.api_key = api_key
        self.timeout = timeout
        self.slots = asyncio.Semaphore(concurrency)

    async def plan(self, query: RouteQuery) -> RoadRoute:
        if not self.api_key:
            raise RouteError(503, "未設定 ROUTES_API_KEY，無法查詢勤崴道路路線。")
        try:
            # 包含等待併發空位的時間，避免整合查詢無限排隊。
            async with asyncio.timeout(self.timeout):
                async with self.slots:
                    response = await self.client.get(DIRECTION_URL, params={
                        "Key": self.api_key,
                        "Origin": f"{query.origin[1]},{query.origin[0]}",
                        "Destination": f"{query.destination[1]},{query.destination[0]}",
                        "Mode": "driving", "Language": "zh-TW",
                    })
        except (TimeoutError, httpx.TimeoutException):
            raise RouteError(504, "勤崴道路路線查詢逾時。") from None
        except httpx.RequestError:
            raise RouteError(502, "無法連線勤崴道路路線服務。") from None
        # 不回傳上游 URL、訊息或 HTTP 例外，避免含 Key 的資料外洩。
        if response.status_code in (401, 403):
            raise RouteError(503, "勤崴 REST 憑證或 Routes 權限遭拒，請查核服務授權。")
        if response.status_code == 429:
            raise RouteError(503, "勤崴道路服務配額或查詢頻率受限。")
        if response.status_code != 200:
            raise RouteError(502, f"勤崴道路服務回應 HTTP {response.status_code}。")
        try:
            data = response.json()
            if not isinstance(data, dict) or not isinstance(data.get("status"), str):
                raise ValueError("缺少服務狀態。")
            if data["status"] == "REQUEST_DENIED":
                raise RouteError(503, "勤崴 REST 憑證或 Routes 權限遭拒，請查核服務授權。")
            if data["status"] == "ZERO_RESULTS":
                raise RouteError(422, "勤崴未提供可行道路路線。")
            if data["status"] != "OK":
                raise RouteError(502, "勤崴未提供可用路線；請查核起訖點、REST 憑證、Routes 權限與配額。")
            if data.get("routes") == []:
                raise RouteError(422, "勤崴未提供可行道路路線。")
            return normalize_route(data, query)
        except (KeyError, IndexError, TypeError, ValueError):
            raise RouteError(502, "勤崴路線回應的道路座標、距離或時間無效。") from None
