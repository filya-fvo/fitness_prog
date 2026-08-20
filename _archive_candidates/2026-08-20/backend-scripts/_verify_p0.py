from app.routers.nutrition import router

paths = sorted({getattr(r, "path", "") for r in router.routes})
print("nutrition_paths:")
for p in paths:
    print(" ", p)
assert any(p.endswith("/log/{log_id}") or "/log/{log_id}" in p for p in paths), paths
print("OK")
