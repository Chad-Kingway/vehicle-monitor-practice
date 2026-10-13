import argparse
from pathlib import Path

import uvicorn

from .app import DEFAULT_CONFIG, create_app


def main():
    parser = argparse.ArgumentParser(description="啟動單一 worker 的車輛監控 Server。")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="模擬設定 JSON 路徑")
    parser.add_argument("--port", type=int, default=8000, help="本機 HTTP 連接埠")
    args = parser.parse_args()
    uvicorn.run(create_app(args.config), host="127.0.0.1", port=args.port, workers=1)


if __name__ == "__main__":
    main()
