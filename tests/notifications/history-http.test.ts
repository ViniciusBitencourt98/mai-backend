import { createServer } from 'node:http';
import { expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app';
import { authSettings } from '../../src/auth/settings';
import { AuthService } from '../../src/services/auth.service';
import { authRepositoryFake } from '../auth/repository.fake';
import { newSessionToken,digest } from '../../src/auth/crypto';
import { HttpError } from '../../src/errors/http-error';
it('history requires session, derives owner, validates queries and exposes GET only without CSRF mutation',async()=>{
 const owner=randomUUID(),id=randomUUID(),token=newSessionToken(),settings=authSettings({CORS_ALLOWED_ORIGIN:'https://app.example.invalid'});
 const auth=authRepositoryFake({id:owner,name:'Synthetic',email:'test@example.invalid',passwordHash:'unused',disabledAt:null,preferences:{timezone:'UTC',emailEnabled:true}});
 await auth.repository.issueSession({userId:owner,tokenHash:digest(token),expiresAt:new Date(Date.now()+60000),now:new Date()});
 const list=vi.fn(async(user:string)=>{expect(user).toBe(owner);return {items:[],page:{number:1,limit:20,hasMore:false}};});
 const get=vi.fn(async(user:string,key:string)=>{expect(user).toBe(owner);throw new HttpError(404,'NOT_FOUND',key===id?'Notification not found':'Notification not found');});
 const server=createServer(createApp('',{services:{auth:{settings,run:fn=>fn(new AuthService(auth.repository))},notifications:{list,get},withTechnicalProbes:async()=>{throw new Error('Unused');}}}));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
 const url=`http://127.0.0.1:${address.port}/notifications`,headers={Cookie:settings.cookieName+'='+token,Origin:'https://app.example.invalid'};
 try{
  expect((await fetch(url)).status).toBe(401);const response=await fetch(url,{headers});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await fetch(url+'?ownerId='+owner,{headers})).status).toBe(400);
  expect((await fetch(url+'?status=SENT&status=FAILED',{headers})).status).toBe(400);
  expect((await fetch(url+'/'+id,{headers})).status).toBe(404);expect((await fetch(url+'/bad',{headers})).status).toBe(400);
  expect((await fetch(url,{method:'POST',headers})).status).toBe(404);
 }finally{await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});}
});
