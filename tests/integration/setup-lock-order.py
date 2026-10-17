"""Local-only regression: setup initialization must not hold profiles while waiting for student_profiles."""
import os
import subprocess
import time
import uuid

CONTAINER = 'supabase_db_private-teachers'
actor = str(uuid.uuid4())
prefix = 'setup-lock-' + actor[:8]


def command(name):
    return ['docker', 'exec', '-i', '-e', 'PGAPPNAME=' + name, CONTAINER,
            'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']


def query(sql, check=True):
    result = subprocess.run(command(prefix + '-check'), input="set statement_timeout='5s';\n" + sql,
                            text=True, capture_output=True, env=os.environ)
    if check and result.returncode:
        raise RuntimeError(result.stderr)
    return result


def wait_for(name, condition):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        result = query("select count(*) from pg_stat_activity where application_name='" + name + "' and " + condition)
        if result.stdout.strip().endswith('1'):
            return
        time.sleep(0.05)
    raise AssertionError('Database test session did not reach expected state: ' + name)


blocker = initializer = None
try:
    query("insert into auth.users(id,aud,role,email,raw_user_meta_data) values ('" + actor +
          "','authenticated','authenticated','" + prefix + "@test.invalid','{\"full_name\":\"Lock order fixture\",\"requested_role\":\"student\"}');")
    blocker = subprocess.Popen(command(prefix + '-blocker'), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    blocker.stdin.write("begin; select 1 from public.student_profiles where id='" + actor + "' for update;\n")
    blocker.stdin.flush()
    wait_for(prefix + '-blocker', "state='idle in transaction'")
    initializer = subprocess.Popen(command(prefix + '-initializer'), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    initializer.stdin.write("set statement_timeout='5s'; begin; set local role authenticated; set local request.jwt.claim.sub='" + actor + "'; select public.get_or_create_account_setup_draft('en',null); rollback;\n")
    initializer.stdin.close()
    wait_for(prefix + '-initializer', "wait_event_type='Lock'")
    result = query("begin; select 1 from public.profiles where id='" + actor + "' for update nowait; rollback;", check=False)
    assert result.returncode == 0, 'Setup held profiles while waiting for student_profiles: ' + result.stderr
    print('PASS setup waits for the student row before locking the base profile.')
finally:
    if blocker and blocker.poll() is None:
        blocker.stdin.write('rollback;\n'); blocker.stdin.close(); blocker.wait(timeout=10)
    if initializer and initializer.poll() is None:
        initializer.wait(timeout=10)
    query("delete from auth.users where id='" + actor + "';")
