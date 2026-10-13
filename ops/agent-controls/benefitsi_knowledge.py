"""Create-only, scoped Benefitsi notes. No general vault editor or ARC access."""
import contextlib
import datetime
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import uuid
from benefitsi_agent_context import PROFILES, _directory, _read, timestamp

FOLDERS={'task':'96 Aufgaben','decision':'95 Agenten/Entscheidungen','result':'95 Agenten/Ergebnisse'}
MAX_TASKS=200

def _validate(data):
    if not isinstance(data,dict) or type(data.get('schemaVersion')) is not int or data.get('schemaVersion')!=1:raise ValueError('knowledge_invalid_input')
    if data.get('action')=='note-read':
        if set(data)!={'schemaVersion','action','id'} or not isinstance(data.get('id'),str) or not re.fullmatch(r'[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}',data['id']):raise ValueError('knowledge_invalid_input')
        return {**data,'id':str(uuid.UUID(data['id']))}
    if data.get('action')=='task-list':
        if set(data)!={'schemaVersion','action'}:raise ValueError('knowledge_invalid_input')
        return data
    if data.get('action')!='note-create' or set(data)-{'schemaVersion','action','kind','title','content','profileId','dueDate','requestId'}:raise ValueError('knowledge_invalid_input')
    kind=data.get('kind')
    if not isinstance(kind,str) or kind not in FOLDERS:raise ValueError('knowledge_invalid_input')
    for name,maximum in (('title',140),('content',12000)):
        value=data.get(name)
        if not isinstance(value,str) or not value.strip() or len(value)>maximum or '\x00' in value:raise ValueError('knowledge_invalid_input')
        try:value.encode('utf-8')
        except UnicodeEncodeError:raise ValueError('knowledge_invalid_input') from None
    if data.get('profileId') is not None and data['profileId'] not in PROFILES:raise ValueError('knowledge_invalid_input')
    if 'dueDate' in data:
        if kind!='task' or not isinstance(data['dueDate'],str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',data['dueDate']):raise ValueError('knowledge_invalid_input')
        try:datetime.date.fromisoformat(data['dueDate'])
        except ValueError:raise ValueError('knowledge_invalid_input') from None
    value=data.get('requestId')
    if not isinstance(value,str) or not re.fullmatch(r'[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}',value):raise ValueError('knowledge_invalid_input')
    return {**data,'requestId':str(uuid.UUID(value))}

@contextlib.contextmanager
def _lock(root):
    directory=_directory(root);lock=None
    try:
        lock=os.open('.benefitsi-write.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,0o600,dir_fd=directory)
        if not stat.S_ISREG(os.fstat(lock).st_mode):raise ValueError('knowledge_symlink')
        fcntl.flock(lock,fcntl.LOCK_EX)
        yield directory
    except OSError:raise ValueError('knowledge_symlink') from None
    finally:
        if lock is not None:os.close(lock)
        os.close(directory)

def _folder(root_fd,folder):
    directory=os.dup(root_fd)
    try:
        for part in folder.split('/'):
            try:os.mkdir(part,0o700,dir_fd=directory)
            except FileExistsError:pass
            try:child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
            except OSError:raise ValueError('knowledge_symlink') from None
            os.close(directory);directory=child
        return directory
    except BaseException:os.close(directory);raise

def _note(root,folder,filename):
    try:return _read(root,folder,filename)
    except ValueError as error:
        if str(error)=='context_file_missing' or str(error)=='context_unavailable':return None
        raise ValueError(str(error).replace('context_','knowledge_')) from None

def _record(content):
    if not content.startswith('---\n'):return None
    header=content.split('\n---\n',1)[0]
    lines=header.splitlines()
    record=next((line[len('benefitsi_record: '):] for line in lines if line.startswith('benefitsi_record: ')),None)
    if record is None:return None
    try:data=json.loads(record)
    except (ValueError,TypeError):return None
    if not isinstance(data,dict) or not isinstance(data.get('kind'),str) or data.get('kind') not in FOLDERS:return None
    state=next((line.split(': ',1)[1] for line in lines if line.startswith('status: ')),None)
    return {**data,'state':state}

def _base():return {'schemaVersion':1,'sourceId':'benefitsi-obsidian','ownership':'BENEFITSI_EXTERNAL','checkedAt':timestamp()}

def _receipt(data,note,path,created):
    return {**_base(),'path':path,'title':data['title'],'kind':data['kind'],'sha256':note['sha256'],'readbackVerified':True,'created':created,'mirrorState':'pending'}

def benefitsi_knowledge_request(data,*,vault_root):
    data=_validate(data);root=Path(vault_root)
    try:
        with _lock(root) as root_fd:
            if data['action']=='note-read':
                filename=data['id']+'.md'
                for kind,folder in FOLDERS.items():
                    note=_note(root,folder,filename)
                    if note is None:continue
                    record=_record(note['content'])
                    if not record or record.get('id')!=data['id'] or record.get('kind')!=kind or record.get('profileId') is not None and record['profileId'] not in PROFILES:raise ValueError('knowledge_file_forbidden')
                    return {**_base(),'id':data['id'],'path':f'{folder}/{filename}','title':record['title'],'kind':kind,'profileId':record.get('profileId'),'createdAt':record['createdAt'],'modifiedAt':note['modifiedAt'],'sha256':note['sha256'],'hashVersion':'sha256-bytes-v1','byteLength':note['byteLength'],'content':note['content']}
                raise ValueError('knowledge_file_missing')
            if data['action']=='task-list':
                folder=FOLDERS['task']
                fd=_folder(root_fd,folder)
                try:names=sorted(name for name in os.listdir(fd) if name.endswith('.md'))
                finally:os.close(fd)
                items=[];truncated=len(names)>MAX_TASKS
                for name in names[:MAX_TASKS]:
                    note=_note(root,folder,name)
                    record=_record(note['content']) if note else None
                    if not record or record.get('kind')!='task' or not isinstance(record.get('id'),str) or record.get('id')+'.md'!=name:
                        truncated=True;continue
                    if record.get('state')=='done':continue
                    if record.get('state')!='open':truncated=True;continue
                    try:
                        _validate({'schemaVersion':1,'action':'note-create','kind':'task','title':record['title'],'content':'metadata','requestId':record['id'],**({'profileId':record['profileId']} if record.get('profileId') else {}),**({'dueDate':record['dueDate']} if record.get('dueDate') else {})})
                    except (ValueError,KeyError):truncated=True;continue
                    items.append({'id':record['id'],'title':record['title'],'dueDate':record.get('dueDate'),'profileId':record.get('profileId'),'path':f'{folder}/{name}','createdAt':record['createdAt'],'state':'open'})
                return {**_base(),'items':items,'truncated':truncated}
            filename=data['requestId']+'.md'
            digest=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode('utf-8')).hexdigest()
            for kind,folder in FOLDERS.items():
                note=_note(root,folder,filename)
                if note is None:continue
                existing=_record(note['content'])
                if not existing or existing.get('request_sha256')!=digest or kind!=data['kind']:raise ValueError('knowledge_conflict')
                return _receipt(data,note,f'{folder}/{filename}',False)
            folder=FOLDERS[data['kind']];fd=_folder(root_fd,folder)
            record={'id':data['requestId'],'kind':data['kind'],'title':data['title'],'createdAt':timestamp(),'profileId':data.get('profileId'),'dueDate':data.get('dueDate'),'request_sha256':digest}
            markdown=f'---\nbenefitsi_record: {json.dumps(record,ensure_ascii=False,separators=(",",":"))}\nstatus: open\ntitle: {json.dumps(data["title"],ensure_ascii=False)}\n---\n\n# {data["title"]}\n\n{data["content"]}\n'
            payload=markdown.encode('utf-8')
            if len(payload)>65536:raise ValueError('knowledge_too_large')
            try:
                output=os.open(filename,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=fd)
                try:
                    with os.fdopen(output,'wb') as stream:stream.write(payload);stream.flush();os.fsync(stream.fileno())
                    os.fsync(fd)
                except BaseException:
                    os.unlink(filename,dir_fd=fd);raise
            except FileExistsError:raise ValueError('knowledge_conflict') from None
            finally:os.close(fd)
            note=_note(root,folder,filename)
            if note is None or note['sha256']!=hashlib.sha256(payload).hexdigest():raise ValueError('knowledge_readback_failed')
            return _receipt(data,note,f'{folder}/{filename}',True)
    except ValueError as error:
        if str(error).startswith('context_'):raise ValueError(str(error).replace('context_','knowledge_')) from None
        raise

def registered_cli_root():
    # No network credential is loaded by the native note helper.
    root=Path('/Users/patrick/Documents/Obsidian/Benefitsi')
    marker=_read(root,'','.arc-source.json')
    try:data=json.loads(marker['content'])
    except ValueError:raise ValueError('knowledge_source_invalid') from None
    source=data.get('sourceId',data.get('source_id',data.get('id')))
    if source!='benefitsi-obsidian' or data.get('ownership')!='BENEFITSI_EXTERNAL' or type(data.get('schemaVersion')) is not int or data.get('schemaVersion')!=1:raise ValueError('knowledge_source_invalid')
    return root

if __name__=='__main__':
    try:
        raw=sys.stdin.buffer.read(64*1024+1)
        if len(raw)>64*1024:raise ValueError('knowledge_too_large')
        value=json.loads(raw)
        print(json.dumps(benefitsi_knowledge_request(value,vault_root=registered_cli_root()),ensure_ascii=False))
    except (ValueError,OSError,PermissionError):
        print(json.dumps({'error':'knowledge_operation_failed'}));sys.exit(1)
