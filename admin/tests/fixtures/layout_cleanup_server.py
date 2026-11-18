"""Real app/admin with isolated accounts and state; no model calls or production writes."""
from dataclasses import replace
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
with tempfile.TemporaryDirectory(prefix='winmate-layout-cleanup-') as directory:
    tmp = Path(directory)
    for name, relative in {
        'WINMATE_ADMIN_DATA': 'admin', 'WINMATE_AUTH_DIR': 'auth',
        'WINMATE_LAYOUT_LIBRARY': 'library.json', 'WINMATE_LAYOUT_PRESETS': 'presets.json',
        'WINMATE_LAYOUT_FLOWS': 'flows.json', 'WINMATE_ACCOUNT_DATA_DB': 'accounts.sqlite',
        'WINMATE_RESOURCE_SWITCHES': 'switches.json',
        'WINMATE_TEMPLATE_DB': 'templates.sqlite', 'WINMATE_SPATIAL_DB': 'spatial.sqlite',
        'WINMATE_STORYBOARD_DIR': 'storyboards',
    }.items():
        os.environ[name] = str(tmp / relative)
    os.environ.update(WINMATE_CACHE_BACKEND='memory', WINMATE_SPATIAL_RENDERER='off', WINMATE_SPATIAL_PREWARM='off')
    from app.api import main
    from app.api.poc import settings, service
    from admin import server
    import uvicorn

    settings._SETTINGS = settings.load_settings({}, [])
    main.initialize_poc = lambda: service.initialize(require_provider=False, warm=False)
    metrics = main.DailyCatalogMetrics
    main.DailyCatalogMetrics = lambda _, collect: metrics(tmp / 'metrics.sqlite', collect)
    auth = main.app.state.auth
    auth.reconfigure(replace(auth.config, enabled=True, auth_dir=tmp / 'auth', iterations=2000))
    auth.set_credentials('admin', 'layout-cleanup-isolated-password')
    uvicorn.run(server.app, host='127.0.0.1', port=int(os.environ.get('WINMATE_API_PORT', '8799')), log_level='warning')
