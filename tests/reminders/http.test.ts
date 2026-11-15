import {createServer} from 'node:http';
import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../src/app';
import {authSettings} from '../../src/auth/settings';
import {AuthService} from '../../src/services/auth.service';
import {authRepositoryFake} from '../auth/repository.fake';
import {newSessionToken,digest,csrfToken} from '../../src/auth/crypto';
import {HttpError} from '../../src/errors/http-error';
it('HTTP exposes only owned rule configuration, with session, strict input and CSRF',async()=>{
 const owner=randomUUID(),source=randomUUID(),token=newSessionToken();const settings=authSettings({CORS_ALLOWED_ORIGIN:'https://app.example.invalid'});
 const auth=authRepositoryFake({id:owner,name:'Synthetic',email:'test@example.invalid',passwordHash:'unused',disabledAt:null,preferences:{timezone:'UTC',emailEnabled:true}});
 await auth.repository.issueSession({userId:owner,tokenHash:digest(token),expiresAt:new Date(Date.now()+60000),now:new Date()});
 const get=vi.fn(async(user:string,ref:{sourceId:string})=>{if(ref.sourceId!==source)throw new HttpError(404,'NOT_FOUND','Reminder source not found');expect(user).toBe(owner);return null;});
 const set=vi.fn(async(user:string,ref:{sourceId:string},input:object)=>{await get(user,ref);return input;});
 const server=createServer(createApp('',{services:{auth:{settings,run:fn=>fn(new AuthService(auth.repository))},reminders:{get,set},withTechnicalProbes:async()=>{throw new Error('Unused');}}}));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
 const url=`http://127.0.0.1:${address.port}/reminders/TASK/${source}`,headers={Cookie:settings.cookieName+'='+token,Origin:'https://app.example.invalid','X-CSRF-Token':csrfToken(token),'Content-Type':'application/json'};
 try{
  expect((await fetch(url)).status).toBe(401);expect(await(await fetch(url,{headers})).json()).toEqual({rule:null});
  expect((await fetch(url,{method:'PUT',headers,body:JSON.stringify({leadMinutes:60,enabled:true})})).status).toBe(200);
  for(const patch of [{Origin:''},{'X-CSRF-Token':''}])expect((await fetch(url,{method:'PUT',headers:{...headers,...patch},body:'{"leadMinutes":1,"enabled":true}'})).status).toBe(403);
  expect((await fetch(url,{method:'PUT',headers,body:JSON.stringify({leadMinutes:1,enabled:true,ownerId:owner})})).status).toBe(400);
  expect((await fetch(url+'?ownerId='+owner,{headers})).status).toBe(400);expect((await fetch(url.replace(source,randomUUID()),{headers})).status).toBe(404);
  expect((await fetch(url,{method:'OPTIONS',headers:{...headers,'Access-Control-Request-Method':'PUT'}})).headers.get('access-control-allow-methods')).toContain('PUT');
 }finally{await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});}
});
