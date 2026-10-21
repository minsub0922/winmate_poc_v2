from __future__ import annotations
import base64
import json
import os
import re
import secrets
import time

from app.api.auth import Credentials, DEFAULT_ITERATIONS, generate_password, hash_password, validate_password, validate_username
from .engine import EngineError


PUBLIC = 'username,display_name,role,active,credential_source,created_at,updated_at,last_login,note'


class Accounts:
    def __init__(self, operations, auth):
        self.ops, self.auth = operations, auth
        legacy = auth.credentials()
        self.legacy_username = legacy.username if legacy else None
        if legacy:
            with self.ops.db() as db:
                db.execute('''INSERT OR IGNORE INTO users(username,display_name,role,active,credential_source,created_at,updated_at)
                              VALUES (?,?,'admin',1,'legacy',?,?)''', (legacy.username,legacy.username,time.time(),time.time()))
        auth.accounts = self

    def configured(self):
        return bool(self.ops.one('SELECT count(*) n FROM users WHERE active=1')['n'])

    def credentials(self, username, legacy):
        row = self.ops.one('SELECT * FROM users WHERE username=? AND active=1', (username,))
        if not row:
            return None
        if row['credential_source'] == 'legacy':
            return legacy if legacy and legacy.username == username else None
        try:
            return Credentials(username,row['iterations'],row['generation'],'',base64.b64decode(row['salt']),base64.b64decode(row['password_hash']))
        except (ValueError,TypeError):
            return None

    def role(self, username):
        row=self.ops.one('SELECT role FROM users WHERE username=? AND active=1',(username,))
        return row['role'] if row else 'member'

    def exists(self,username):
        return bool(self.ops.one('SELECT 1 FROM users WHERE username=?',(username,)))

    def login(self, username):
        with self.ops.db() as db:
            db.execute('UPDATE users SET last_login=? WHERE username=?',(time.time(),username))

    @staticmethod
    def names(raw):
        if not isinstance(raw,str):
            raise EngineError('아이디를 쉼표로 구분해 입력해 주세요.')
        names=[v.strip() for v in re.split(r'[,\n]',raw) if v.strip()]
        if not names or len(names)>50:
            raise EngineError('한 번에 1~50개의 아이디를 입력해 주세요.')
        if len(set(names))!=len(names):
            raise EngineError('입력한 아이디가 중복됩니다.')
        if any(name.lower() in ('system','anonymous','guest','scheduler') for name in names):
            raise EngineError('system, anonymous, guest, scheduler는 시스템용 아이디입니다.')
        try:
            for name in names: validate_username(name)
        except ValueError as exc:
            raise EngineError(str(exc)) from None
        return names

    @staticmethod
    def password(value=None):
        value=generate_password() if value is None else value
        try: validate_password(value)
        except ValueError as exc: raise EngineError(str(exc)) from None
        return value

    def create(self, raw, password=None, role='member', display_name='', actor='admin'):
        names=self.names(raw)
        if role not in ('member','admin'):
            raise EngineError('사용자 권한이 올바르지 않습니다.')
        password=self.password(password)
        prepared=[]
        for name in names:
            salt=os.urandom(16)
            prepared.append((name,display_name.strip() if len(names)==1 and display_name.strip() else name,role,1,'managed',
                base64.b64encode(salt).decode(),base64.b64encode(hash_password(password,salt,DEFAULT_ITERATIONS)).decode(),
                DEFAULT_ITERATIONS,secrets.token_hex(8),time.time(),time.time()))
        with self.ops.db(immediate=True) as db:
            existing=[name for name in names if db.execute('SELECT 1 FROM users WHERE username=?',(name,)).fetchone()]
            if existing:
                raise EngineError('이미 존재하는 아이디: '+', '.join(existing))
            db.executemany('''INSERT INTO users(username,display_name,role,active,credential_source,salt,password_hash,
                              iterations,generation,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)''',prepared)
        from app.api.telemetry import emit
        emit('admin.user',username=actor,feature='admin.users',action='create',metadata={'users':names,'role':role,'count':len(names)})
        # One shared initial password for this batch; never stored in a log or subsequent API response.
        return {'users':names,'initial_password':password,'password_delivery':'once'}

    def edit(self, username, *, active=None, role=None, display_name=None, note=None, actor='admin'):
        if role is not None and role not in ('member','admin'):
            raise EngineError('사용자 권한이 올바르지 않습니다.')
        with self.ops.db(immediate=True) as db:
            row=db.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone()
            if not row:raise EngineError('사용자를 찾지 못했습니다.')
            new_active=bool(row['active']) if active is None else active
            new_role=row['role'] if role is None else role
            if row['active'] and row['role']=='admin' and (not new_active or new_role!='admin'):
                others=db.execute("SELECT count(*) FROM users WHERE active=1 AND role='admin' AND username!=?",(username,)).fetchone()[0]
                if not others:raise EngineError('마지막 관리자 계정은 사용 중지하거나 권한을 해제할 수 없습니다.')
            db.execute('UPDATE users SET active=?,role=?,display_name=?,note=?,updated_at=? WHERE username=?',
                (new_active,new_role,display_name if display_name is not None else row['display_name'],note if note is not None else row['note'],time.time(),username))
            if row['active'] and not new_active:
                if row['credential_source']=='legacy':self.auth.invalidate_legacy_sessions()
                else:db.execute('UPDATE users SET generation=? WHERE username=?',(secrets.token_hex(8),username))
        from app.api.telemetry import emit
        emit('admin.user',username=actor,feature='admin.users',action='edit',metadata={'target':username,'active':new_active,'role':new_role})
        return {'ok':True}

    def reset(self, raw, password=None, actor='admin'):
        names=self.names(raw)
        password=self.password(password)
        if self.legacy_username in names and len(names)>1:
            raise EngineError('기존 기본 관리자의 비밀번호는 해당 계정만 선택해 재설정해 주세요.')
        with self.ops.db(immediate=True) as db:
            for name in names:
                if not db.execute('SELECT 1 FROM users WHERE username=?',(name,)).fetchone():
                    raise EngineError('사용자를 찾지 못했습니다: '+name)
            if self.legacy_username in names:
                self.auth.set_credentials(self.legacy_username,password)
            else:
                for name in names:
                    salt=os.urandom(16)
                    db.execute('UPDATE users SET salt=?,password_hash=?,iterations=?,generation=?,updated_at=? WHERE username=?',
                        (base64.b64encode(salt).decode(),base64.b64encode(hash_password(password,salt,DEFAULT_ITERATIONS)).decode(),DEFAULT_ITERATIONS,secrets.token_hex(8),time.time(),name))
        from app.api.telemetry import emit
        emit('admin.user',username=actor,feature='admin.users',action='password_reset',metadata={'users':names})
        return {'users':names,'initial_password':password,'password_delivery':'once'}

    def list(self,q='',active=None,offset=0,limit=30):
        conditions,args=[],[]
        if q:
            conditions.append('(instr(username,?)>0 OR instr(display_name,?)>0)');args.extend([q,q])
        if active is not None:
            conditions.append('active=?');args.append(active)
        where=' WHERE '+' AND '.join(conditions) if conditions else ''
        return {'items':self.ops.rows('SELECT '+PUBLIC+' FROM users'+where+' ORDER BY created_at,username LIMIT ? OFFSET ?',[*args,limit,offset]),
                'total':self.ops.one('SELECT count(*) n FROM users'+where,args)['n']}
