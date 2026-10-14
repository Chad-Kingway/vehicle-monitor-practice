# 理解 Pydantic 欄位下限與路由執行時機

使用者正確指出 `passenger_count` 必須大於或等於 1，因此缺少欄位或傳入 0 都不會進入路由函式。已理解 FastAPI 會先依 Pydantic 模型驗證 request body，再呼叫 handler；後續可以沿著驗證成功的資料追蹤非同步方法與狀態更新。
