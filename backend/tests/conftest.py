"""
Shared test setup. Keeps every test offline: no Nebius key, no Supabase
connection, no network.
"""

import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("NEBIUS_API_KEY", "test-key-unused")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key-unused")

# db.py builds a real Supabase client at import and the client library rejects a
# fake key outright. Tests never touch a database, so stand in a stub module
# before anything imports it. Individual tests replace persistence.supabase.
if "db" not in sys.modules:
    _stub = types.ModuleType("db")
    _stub.supabase = None
    sys.modules["db"] = _stub
