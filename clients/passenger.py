import argparse
import asyncio
import json
import math
from pathlib import Path
import random
from uuid import uuid4

import httpx


DEFAULT_CONFIG = Path(__file__).resolve().parents[1] / "config" / "simulation.json"


async def run(server_url, config_path=DEFAULT_CONFIG, total=None, interval_min=None, interval_max=None):
    settings = json.loads(config_path.read_text(encoding="utf-8-sig"))["generator"]
    total = settings["total_requests"] if total is None else total
    interval_min = settings["interval_min_seconds"] if interval_min is None else interval_min
    interval_max = settings["interval_max_seconds"] if interval_max is None else interval_max
    valid_intervals = all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in (interval_min, interval_max))
    if type(total) is not int or total < 0 or not valid_intervals or interval_min <= 0 or interval_max < interval_min:
        raise ValueError("總數必須為非負整數，間隔須為有限正數且上限不得小於下限。")
    run_id = None
    completed = 0
    pending = None
    interrupted = False
    async with httpx.AsyncClient(base_url=server_url.rstrip("/"), timeout=5.0, trust_env=False) as client:
        while completed < total:
            # 每筆重新等待；斷線時不累積逾期送單，也不補發。
            await asyncio.sleep(random.uniform(interval_min, interval_max) if pending is None else 1)
            try:
                response = await client.get("/api/simulation")
                response.raise_for_status()
                current_run = response.json()["run_id"]
                if run_id is None:
                    run_id = current_run
                elif current_run != run_id:
                    print("Server 已開始新輪次；請重新啟動乘客模擬程式。", flush=True)
                    return
                if interrupted:
                    interrupted = False
                    print("HTTP 已恢復，繼續剩餘筆數。", flush=True)
                    if pending is None:
                        continue
                if pending is None:
                    pending = {"run_id": run_id, "passenger_id": f"generator-{uuid4()}", "client_request_id": str(uuid4())}
                response = await client.post("/api/requests/random", json=pending)
                if response.status_code == 409:
                    print("Server 輪次已變更；請重新啟動乘客模擬程式。", flush=True)
                    return
                if response.status_code == 422:
                    completed += 1
                    print(f"第 {completed}/{total} 次生成失敗，未送單：{response.text}", flush=True)
                    pending = None
                    continue
                response.raise_for_status()
                completed += 1
                print(f"第 {completed}/{total} 筆：{response.json()['id']}，乘客 {pending['passenger_id']}", flush=True)
                pending = None
            except httpx.HTTPError as error:
                if not interrupted:
                    print(f"HTTP 中斷：{error}；暫停生成。", flush=True)
                interrupted = True
                # 保留送單識別，避免 Server 已受理但回應中斷時重複新增。
        print(f"乘客模擬程式已結束，共執行 {completed} 次。", flush=True)


def main():
    parser = argparse.ArgumentParser(description="限量自動生成乘車請求。")
    parser.add_argument("--server", default="http://127.0.0.1:8000", help="Server HTTP URL")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="讀取本機 generator 設定")
    parser.add_argument("--total", type=int, help="覆寫生成總數")
    parser.add_argument("--interval-min", type=float, help="覆寫最短真實秒數")
    parser.add_argument("--interval-max", type=float, help="覆寫最長真實秒數")
    args = parser.parse_args()
    try:
        asyncio.run(run(args.server, args.config, args.total, args.interval_min, args.interval_max))
    except KeyboardInterrupt:
        print("\n乘客模擬程式已停止。")
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f"設定錯誤：{error}\n")


if __name__ == "__main__":
    main()
