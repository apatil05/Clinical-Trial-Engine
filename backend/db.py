"""
db.py — the Supabase client, built once at import and shared.

Do not call create_client() anywhere else. Import this one.

SUPABASE_KEY is the anon key. The policies in supabase/schema.sql give anon
full read and write on every table, patients.raw_text included. That is a demo
configuration. Read the known limitations section of the README before pointing
this at anything real.
"""

import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
