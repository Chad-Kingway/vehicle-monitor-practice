# 理解 FastAPI lifespan 分界

使用者正確說明 `yield` 是 FastAPI 開始使用共享資源的分界，因此 `app.state` 物件必須在 `yield` 前準備完成。這證明已理解 lifespan 的啟動／服務階段關係，可繼續深化 `@asynccontextmanager` 與資源清理，以及環境變數合併的覆蓋順序。
