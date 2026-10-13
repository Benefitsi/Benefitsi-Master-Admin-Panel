"""Read-only Benefitsi profile context; no paths, secrets or commands accepted."""
import datetime
import errno
import hashlib
import os
from pathlib import Path
import stat

PROFILES = ('ben','benefitsi-content','benefitsi-finance','benefitsi-seo','city-annweiler','benefitsi-menu')
FILES = {profile: {'soul':'SOUL.md','knowledge':'KNOWLEDGE.md'} for profile in PROFILES}
for profile in ('ben','benefitsi-seo','city-annweiler'): FILES[profile]['reference-memory']='MEMORY.md'
for profile in ('ben','benefitsi-content','benefitsi-seo','city-annweiler'): FILES[profile]['short-memory']='memories/MEMORY.md'
MAX_BYTES = 64 * 1024

def timestamp(value=None):
    return datetime.datetime.fromtimestamp(value,datetime.timezone.utc).isoformat() if value is not None else datetime.datetime.now(datetime.timezone.utc).isoformat()

def _directory(path):
    path=Path(path).absolute()
    fd=os.open(path.anchor,os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            try: next_fd=os.open(part,os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,dir_fd=fd)
            except OSError as error:
                if error.errno in (errno.ELOOP,errno.ENOTDIR):raise ValueError('context_symlink') from None
                raise ValueError('context_unavailable') from None
            os.close(fd);fd=next_fd
        return fd
    except BaseException:os.close(fd);raise

def _read(root,profile,path):
    directory=_directory(Path(root)/profile)
    fd=None
    try:
        parts=path.split('/')
        for part in parts[:-1]:
            try: child=os.open(part,os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,dir_fd=directory)
            except FileNotFoundError:raise ValueError('context_file_missing') from None
            except OSError:raise ValueError('context_symlink') from None
            os.close(directory);directory=child
        try:fd=os.open(parts[-1],os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,dir_fd=directory)
        except FileNotFoundError:raise ValueError('context_file_missing') from None
        except OSError:raise ValueError('context_symlink') from None
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):raise ValueError('context_file_forbidden')
        if before.st_size>MAX_BYTES:raise ValueError('context_too_large')
        chunks=[];size=0
        while True:
            chunk=os.read(fd,min(8192,MAX_BYTES+1-size))
            if not chunk:break
            chunks.append(chunk);size+=len(chunk)
            if size>MAX_BYTES:raise ValueError('context_too_large')
        after=os.fstat(fd)
        if (before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_ino,after.st_size,after.st_mtime_ns):raise ValueError('context_changed')
        raw=b''.join(chunks)
        try:content=raw.decode('utf-8')
        except UnicodeDecodeError:raise ValueError('context_not_utf8') from None
        return {'path':path,'exists':True,'byteLength':len(raw),'modifiedAt':timestamp(after.st_mtime),'sha256':hashlib.sha256(raw).hexdigest(),'hashVersion':'sha256-bytes-v1','content':content}
    finally:
        if fd is not None:os.close(fd)
        os.close(directory)

def agent_context_request(data,*,profiles_root=None):
    if not isinstance(data,dict) or set(data)-{'schemaVersion','action','profileId','fileId'} or type(data.get('schemaVersion')) is not int or data.get('schemaVersion')!=1:raise ValueError('context_invalid_input')
    profile=data.get('profileId')
    if profile not in PROFILES:raise ValueError('context_profile_forbidden')
    action=data.get('action')
    if action not in ('context-list','context-read'):raise ValueError('context_invalid_input')
    root=Path(profiles_root) if profiles_root is not None else Path.home()/'.hermes/profiles'
    result={'schemaVersion':1,'hostId':'m1-benefitsi','profileId':profile,'checkedAt':timestamp()}
    if action=='context-read':
        file_id=data.get('fileId')
        if not isinstance(file_id,str) or file_id not in FILES[profile]:raise ValueError('context_file_forbidden')
        return {**result,'fileId':file_id,**_read(root,profile,FILES[profile][file_id])}
    if 'fileId' in data:raise ValueError('context_invalid_input')
    documents=[]
    for file_id,path in FILES[profile].items():
        try:
            item=_read(root,profile,path)
            item.pop('content');item['fileId']=file_id;documents.append(item)
        except ValueError as error:
            if str(error)!='context_file_missing':raise
    return {**result,'documents':documents}
