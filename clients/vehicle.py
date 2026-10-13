import argparse
import math
import time

import httpx


class DemoMotion:
    """以初始位置為起點的診斷方形；道路路線於任務 02 整合。"""

    def __init__(self, position):
        self.origin = position
        self.distance = 0.0

    def advance(self, seconds, speed_multiplier):
        self.distance = (self.distance + seconds * 5 * speed_multiplier) % 1200
        segment, offset = divmod(self.distance, 300)
        east, north, heading = [
            (offset, 0, 90),
            (300, offset, 0),
            (300 - offset, 300, 270),
            (0, 300 - offset, 180),
        ][int(segment)]
        longitude, latitude = self.origin
        position = [
            longitude + math.degrees(east / (6371000 * math.cos(math.radians(latitude)))),
            latitude + math.degrees(north / 6371000),
        ]
        return position, heading


def run(server_url, vehicle_id, demo):
    run_id = None
    interval = 1.0
    motion = None
    previous = time.monotonic()
    with httpx.Client(base_url=server_url.rstrip("/"), timeout=5.0, trust_env=False) as client:
        while True:
            tick = time.monotonic()
            try:
                response = client.get("/api/simulation")
                response.raise_for_status()
                snapshot = response.json()
                vehicle = next((item for item in snapshot["vehicles"] if item["id"] == vehicle_id), None)
                if vehicle is None:
                    raise ValueError(f"Server 未設定車輛 {vehicle_id}。")
                interval = snapshot["settings"]["report_interval_seconds"]
                if run_id != snapshot["run_id"]:
                    run_id = snapshot["run_id"]
                    motion = DemoMotion(vehicle["initial_position"])
                    position, heading = vehicle["initial_position"], vehicle["initial_heading"]
                    print(f"輪次 {run_id}，車輛 {vehicle_id}", flush=True)
                elif demo:
                    position, heading = motion.advance(tick - previous, snapshot["settings"]["speed_multiplier"])
                else:
                    position, heading = vehicle["position"], vehicle["heading"]
                response = client.post(f"/api/vehicles/{vehicle_id}/reports", json={
                    "run_id": run_id, "position": position, "heading": heading,
                })
                response.raise_for_status()
                print(f"{vehicle_id}  {position[0]:.6f}, {position[1]:.6f}  {heading:.0f}°", flush=True)
            except httpx.HTTPError as error:
                print(f"HTTP 連線失敗：{error}；稍後重試。", flush=True)
            previous = tick
            time.sleep(max(0, interval - (time.monotonic() - tick)))


def main():
    parser = argparse.ArgumentParser(description="透過 HTTP 回報一台模擬車輛。")
    parser.add_argument("--server", default="http://127.0.0.1:8000", help="Server HTTP URL")
    parser.add_argument("--vehicle-id", default="vehicle-01", help="Server 設定的車輛識別碼")
    parser.add_argument("--demo", action="store_true", help="以診斷方形移動，驗證位置與朝向更新")
    args = parser.parse_args()
    try:
        run(args.server, args.vehicle_id, args.demo)
    except KeyboardInterrupt:
        print("\n車輛 Client 已停止。")
    except ValueError as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
