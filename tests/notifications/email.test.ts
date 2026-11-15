import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GmailTransport, mime, EmailFailure } from '../../src/notifications/email';
import { reminderTemplate, digestTemplate, activityLink } from '../../src/notifications/templates';
import { NotificationDelivery } from '../../src/notifications/delivery';
import type { NotificationService } from '../../src/services/notification.service';
import type { OutboxRecord } from '../../src/notifications/dto';
import type { DashboardService } from '../../src/services/dashboard.service';
const email={to:'test@example.invalid',subject:'MAI — teste',text:'Olá',html:'<p>Olá</p>'};
it.each(['TASK','EVENT','PUBLICATION'] as const)('renders %s with escaped HTML and plain alternative',type=>{
 const m=reminderTemplate({type,title:'<script>&"',date:type==='TASK'?'2026-11-15':'2026-11-15T12:00:00Z',timezone:'America/Sao_Paulo'});
 expect(m.html).not.toContain('<script>');expect(m.html).toContain('&lt;script&gt;&amp;&quot;');expect(m.text).toContain('<script>');
 expect(m.text).toContain(type==='TASK'?'sem horário':'09:00');expect(m.subject).toContain('MAI');
});
it('builds only safe application links and rejects header injection',()=>{
 expect(activityLink('https://mai.example','TASK','id')).toBe('https://mai.example/app/tarefas/id');
 expect(()=>activityLink('javascript:alert(1)','TASK','id')).toThrow();
 expect(()=>mime({...email,to:'test@example.invalid\r\nBcc:bad@example.invalid'},'sender@example.invalid')).toThrow();
 const message=mime(email,'sender@example.invalid');expect(message).toContain('multipart/alternative');expect(message).toContain('text/plain');expect(message).toContain('text/html');expect(message).toContain(Buffer.from('Olá').toString('base64'));
});
const bindings=()=>({EMAIL_DELIVERY_ENABLED:'true',GMAIL_CLIENT_ID:randomUUID(),GMAIL_CLIENT_SECRET:randomUUID(),GMAIL_REFRESH_TOKEN:randomUUID(),GMAIL_FROM:'sender@example.invalid'});
it('real adapter sends OAuth refresh then Gmail MIME and returns only observed acceptance',async()=>{
 const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({access_token:randomUUID()})).mockResolvedValueOnce(Response.json({id:'provider-message'}));
 expect(await new GmailTransport(bindings(),request).send(email)).toEqual({providerMessageId:'provider-message'});
 expect(request).toHaveBeenCalledTimes(2);expect(request.mock.calls[0]![0]).toBe('https://oauth2.googleapis.com/token');
 const body=JSON.parse(request.mock.calls[1]![1]!.body as string);expect(Buffer.from(body.raw,'base64url').toString()).toContain('To: test@example.invalid');
 expect(request.mock.calls[1]![1]!.redirect).toBe('error');
});
it.each([401,429,500])('does not retry Gmail rejection %s',async status=>{
 const request=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({access_token:randomUUID()})).mockResolvedValueOnce(new Response('private response',{status}));
 await expect(new GmailTransport(bindings(),request).send(email)).rejects.toMatchObject({category:'PROVIDER_REJECTED',message:'Email delivery failed'});expect(request).toHaveBeenCalledTimes(2);
});
it('network uncertainty and invalid acceptance are sanitized with no retry',async()=>{
 for(const response of [Promise.reject(new Error('private token')),Promise.resolve(Response.json({}))]){
  const request=vi.fn<typeof fetch>().mockImplementationOnce(()=>response);
  await expect(new GmailTransport(bindings(),request).send(email)).rejects.toMatchObject({category:'NETWORK',message:'Email delivery failed'});expect(request).toHaveBeenCalledOnce();
 }
});
it('disabled or incomplete transport never calls network',async()=>{
 const request=vi.fn<typeof fetch>();await expect(new GmailTransport({},request).send(email)).rejects.toMatchObject({category:'INTERNAL'});expect(request).not.toHaveBeenCalled();
});
function deliveryFixture(){
 const row={id:randomUUID(),ownerId:randomUUID(),status:'PUBLISHED'} as OutboxRecord;
 const claim={...row,status:'RESERVED',reservedFrom:'PUBLISHED',leaseToken:randomUUID(),leaseUntil:new Date(Date.now()+300000)};
 const service={reserve:vi.fn().mockResolvedValue(claim),prepareDelivery:vi.fn().mockResolvedValue(claim),accepted:vi.fn(),fail:vi.fn()};
 const content={prepare:vi.fn().mockResolvedValue(email)},transport={send:vi.fn().mockResolvedValue({providerMessageId:'observed'})},log=vi.fn();
 return {row,claim,service,content,transport,log,delivery:new NotificationDelivery(service as unknown as NotificationService,content,transport,log)};
}
it('reserves, revalidates, sends once then persists provider acceptance',async()=>{
 const f=deliveryFixture();await f.delivery.deliver(f.row);expect(f.transport.send).toHaveBeenCalledOnce();expect(f.service.accepted).toHaveBeenCalledWith(f.row.ownerId,f.row.id,{leaseToken:f.claim.leaseToken,providerMessageId:'observed'});expect(f.service.fail).not.toHaveBeenCalled();
});
it('records failure without throwing into queue retry',async()=>{
 const f=deliveryFixture();f.transport.send.mockRejectedValue(new EmailFailure('NETWORK'));await f.delivery.deliver(f.row);expect(f.service.fail).toHaveBeenCalledWith(f.row.ownerId,f.row.id,{leaseToken:f.claim.leaseToken,category:'NETWORK'});expect(f.service.accepted).not.toHaveBeenCalled();expect(f.transport.send).toHaveBeenCalledOnce();
});
it('preserves uncertain acceptance when DB confirmation fails; no failure overwrite or resend',async()=>{
 const f=deliveryFixture();f.service.accepted.mockRejectedValue(new Error('DB failure'));await f.delivery.deliver(f.row);expect(f.log).toHaveBeenCalledWith('DELIVERY_UNCERTAIN',f.row.id);expect(f.service.fail).not.toHaveBeenCalled();expect(f.transport.send).toHaveBeenCalledOnce();
});
it('swallows failure persistence error after attempted delivery conservatively',async()=>{
 const f=deliveryFixture();f.transport.send.mockRejectedValue(new Error('network'));f.service.fail.mockRejectedValue(new Error('DB'));await f.delivery.deliver(f.row);expect(f.log).toHaveBeenCalledWith('DELIVERY_UNCERTAIN',f.row.id);
});
it('does not send cancelled/stale leases and allows only pre-reservation infrastructure retry',async()=>{
 const f=deliveryFixture();f.service.prepareDelivery.mockResolvedValue({...f.claim,status:'CANCELLED'});await f.delivery.deliver(f.row);expect(f.transport.send).not.toHaveBeenCalled();
 f.content.prepare.mockRejectedValue(new Error('DB'));await expect(f.delivery.deliver(f.row)).rejects.toThrow('DB');expect(f.service.reserve).toHaveBeenCalledOnce();
});
it('renders empty and populated digest with explicit truncation and civil date',()=>{
 const empty={date:'2026-11-15',timezone:'America/Bahia',today:{items:[],hasMore:false},overdueTasks:{items:[],hasMore:false}} as unknown as Awaited<ReturnType<DashboardService['get']>>;
 expect(digestTemplate(empty).text).toContain('Nenhuma atividade.');
 empty.today.items.push({type:'TASK',title:'Planejar <vídeo>',date:'2026-11-15',timezone:'America/Bahia',completed:false,masterId:'a'} as never);
 empty.today.hasMore=true;const result=digestTemplate(empty);expect(result.html).toContain('&lt;vídeo&gt;');expect(result.text).toContain('Há mais atividades');expect(result.subject).toContain('2026-11-15');
});

it('folds long UTF-8 subjects into RFC 2047 words without corrupting characters',async()=>{
 const {encodedSubject}=await import('../../src/notifications/email');
 const subject='Título com emoji 🎬 e acentuação '.repeat(20),encoded=encodedSubject(subject);
 const words=encoded.split('\r\n ');expect(words.length).toBeGreaterThan(1);
 expect(words.every(word=>word.length<=75)).toBe(true);
 expect(words.map(word=>Buffer.from(word.slice(10,-2),'base64').toString('utf8')).join('')).toBe(subject);
});
it('redelivery after uncertain acceptance never calls the provider again',async()=>{
 const f=deliveryFixture();f.service.accepted.mockRejectedValue(new Error('DB failed'));
 await f.delivery.deliver(f.row);
 f.service.reserve.mockRejectedValue(new Error('Reservation still held'));
 await expect(f.delivery.deliver(f.row)).rejects.toThrow('Reservation still held');
 expect(f.transport.send).toHaveBeenCalledOnce();expect(f.service.fail).not.toHaveBeenCalled();
});
