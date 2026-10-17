#!/usr/bin/env python3
"""Exercise the deployed last-admin trigger under two READ COMMITTED deletes.

Local-only: requires the disposable Supabase DB container. The scratch database
is uniquely named and dropped in a finally block; the application DB is read
only except for retrieving the exact deployed function definition.
"""
import subprocess
import threading
import time
import uuid

CONTAINER = "supabase_db_private-teachers"
DB = "codex_admin_race_" + uuid.uuid4().hex[:12]
ADMIN_A = "00000000-0000-0000-0000-000000000001"
ADMIN_B = "00000000-0000-0000-0000-000000000002"


def psql(database, sql, *, check=True, app=None):
    cmd = ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-U", "postgres",
           "-d", database, "-v", "ON_ERROR_STOP=1", "-At"]
    if app:
        cmd += ["-c", f"set application_name = '{app}'; {sql}"]
        return subprocess.run(cmd, text=True, capture_output=True, check=check)
    return subprocess.run(cmd, input=sql, text=True, capture_output=True, check=check)


def main():
    fn = psql("postgres", "select pg_get_functiondef('dars_private.guard_last_active_admin()'::regprocedure)").stdout.strip()
    psql("postgres", f'create database "{DB}"')
    try:
        setup = f"""
create schema dars_private;
create type public.user_role as enum ('admin','teacher','student');
create type public.user_status as enum ('active','suspended');
create table public.profiles(id uuid primary key, role public.user_role not null, status public.user_status not null);
{fn};
create trigger profiles_last_active_admin_guard
before delete or update of role, status on public.profiles
for each row execute function dars_private.guard_last_active_admin();
insert into public.profiles values
 ('{ADMIN_A}','admin','active'), ('{ADMIN_B}','admin','active');
"""
        psql(DB, setup)
        first = f"begin; delete from public.profiles where id='{ADMIN_A}'; select pg_sleep(1.5); commit;"
        second = f"begin; delete from public.profiles where id='{ADMIN_B}'; commit;"
        results = {}

        def run_first():
            results["first"] = psql(DB, first, check=False)

        thread = threading.Thread(target=run_first)
        thread.start()
        time.sleep(0.3)  # first delete holds the trigger's transaction advisory lock
        results["second"] = psql(DB, second, check=False)
        thread.join()

        if results["first"].returncode != 0:
            raise RuntimeError("first delete unexpectedly failed: " + results["first"].stderr)
        if results["second"].returncode == 0 or "last_active_admin" not in results["second"].stderr:
            raise RuntimeError("racing second delete was not rejected as last_active_admin: " + results["second"].stderr)
        remaining = psql(DB, "select count(*) from public.profiles where role='admin' and status='active'").stdout.strip()
        if remaining != "1":
            raise RuntimeError(f"expected one active admin after race; found {remaining}")
        print("PASS: concurrent READ COMMITTED deletes leave one active admin; second raises last_active_admin")
    finally:
        psql("postgres", f'drop database if exists "{DB}" with (force)')


if __name__ == "__main__":
    main()
