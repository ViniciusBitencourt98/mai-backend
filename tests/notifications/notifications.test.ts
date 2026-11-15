import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/services/notification.service';
import { reminderRuleDto, notificationQueryDto, type OutboxRecord, type ReminderRecord, type DeliveryRecord } from '../../src/notifications/dto';
import type { NotificationRepository, NotificationContext } from '../../src/repositories/notification.repository';
import { HttpError } from '../../src/errors/http-error';
const sourceId = randomUUID();
/** Serialization/persistence is simulated only here; no queue or production in-memory store. */
function fixture() {
  let clock = new Date('2026-11-15T08:00:00Z');
  const rows = new Map<string, OutboxRecord>(), rules = new Map<string, ReminderRecord>(), logs: DeliveryRecord[] = [];
  const preferences = { timezone: 'UTC', emailEnabled: true, dailyDigestEnabled: true, dailyDigestTime: '08:00' };
  let source: NotificationContext['source'] = { at: new Date('2026-11-15T09:00:00Z'), version: 'a'.repeat(64), timezone: 'UTC', recurrenceRuleId: null, recurrenceVersion: null, occurrenceDate: null };
  let chain = Promise.resolve();
  const serial = <T>(fn: () => T | Promise<T>): Promise<T> => { const result = chain.then(fn); chain = result.then(() => {}, () => {}); return result; };
  const missing = () => new HttpError(404, 'NOT_FOUND', 'Notification resource not found');
  const owned = (owner: string, id: string) => { const row = rows.get(id); if (!row || row.ownerId !== owner) throw missing(); return row; };
  const context = (owner: string, ruleId?: string): NotificationContext => ({ preferences: { ...preferences }, rule: ruleId ? rules.get(ruleId)?.ownerId === owner ? rules.get(ruleId)! : null : null, source: owner === 'A' ? source : null });
  const log = (row: OutboxRecord, result: DeliveryRecord['result'], error: DeliveryRecord['errorCategory'] = null) => logs.push({ id: randomUUID(), outboxId: row.id, ownerId: row.ownerId, status: row.status, attemptedAt: clock, result, errorCategory: error, providerMessageId: row.providerMessageId });
  const repository: NotificationRepository = {
    configure: (owner, input) => serial(() => {
      if (owner !== 'A' || input.sourceId !== sourceId) throw missing();
      const prior = [...rules.values()].find(r => r.ownerId === owner && r.sourceType === input.sourceType && r.sourceId === input.sourceId);
      if (prior && prior.leadMinutes === input.leadMinutes && prior.enabled === input.enabled) return prior;
      const rule = { ...input, id: prior?.id ?? randomUUID(), ownerId: owner, version: (prior?.version ?? 0) + 1, createdAt: prior?.createdAt ?? clock, updatedAt: clock };
      rules.set(rule.id, rule);
      for (const row of rows.values()) if (row.ownerId === owner && row.reminderRuleId === rule.id && ['PENDING','RESERVED','PUBLISHED'].includes(row.status)) {
        Object.assign(row, { status: 'CANCELLED', cancelledAt: clock, leaseToken: null, leaseUntil: null, reservedFrom: null, lastError: 'STALE' }); log(row, 'CANCELLED', 'STALE');
      }
      return structuredClone(rule);
    }),
    enqueue: (owner, reminder, build, validate) => serial(() => {
      const data = build(context(owner, reminder?.reminderRuleId));
      const existing = [...rows.values()].find(r => r.ownerId === owner && r.idempotencyKey === data.idempotencyKey); if (existing) return structuredClone(existing);
      validate(data);
      const row: OutboxRecord = { ...data, id: randomUUID(), ownerId: owner, status: 'PENDING', leaseToken: null, leaseUntil: null, reservedFrom: null, attemptCount: 0,
        publishedAt: null, sentAt: null, failedAt: null, cancelledAt: null, lastError: null, providerMessageId: null, createdAt: clock, updatedAt: clock };
      rows.set(row.id, row); log(row, 'CREATED'); return structuredClone(row);
    }),
    mutate: (owner, id, operation) => serial(() => { const row = owned(owner, id), change = operation(structuredClone(row), context(owner, row.reminderRuleId ?? undefined));
      if (change) { Object.assign(row, change.patch, { updatedAt: clock }); log(row, change.result, change.error ?? null); }
      return structuredClone(row);
    }),
    async get(owner, id) { const row = rows.get(id); return row?.ownerId === owner ? structuredClone(row) : null; },
    async list(owner, q) { return [...rows.values()].filter(r => r.ownerId === owner && (!q.status || r.status === q.status)).sort((a,b)=>a.scheduledAt.getTime()-b.scheduledAt.getTime() || a.id.localeCompare(b.id)).slice((q.page-1)*q.limit,q.page*q.limit+1); },
    async history(owner,id,q) { owned(owner,id); return logs.filter(r=>r.ownerId===owner && r.outboxId===id && (!q.status||r.status===q.status)).slice((q.page-1)*q.limit,q.page*q.limit+1); },
  };
  const service = new NotificationService(repository, () => clock);
  const rule = () => service.configure('A', { sourceType: 'TASK', sourceId, leadMinutes: 60 });
  return { service, repository, rows, rules, logs, preferences, rule, setSource: (value: NotificationContext['source']) => { source = value; }, source: () => source,
    setTime: (at: string) => { clock = new Date(at); } };
}
describe('notification DTOs', () => {
  it.each([{sourceType:'OTHER',sourceId,leadMinutes:1},{sourceType:'TASK',sourceId:'bad',leadMinutes:1},{sourceType:'TASK',sourceId,leadMinutes:-1},{sourceType:'TASK',sourceId,leadMinutes:43201},{sourceType:'TASK',sourceId,leadMinutes:1,ownerId:'other'}])('rejects invalid rule %#', input=>expect(reminderRuleDto.safeParse(input).success).toBe(false));
  it('bounds list queries and rejects unknown/repeated fields',()=>{
    expect(notificationQueryDto.parse({})).toEqual({page:1,limit:20});
    for(const input of [{limit:'101'},{page:'0'},{status:'RETRY'},{ownerId:'B'},{status:['PENDING','SENT']}])expect(notificationQueryDto.safeParse(input).success).toBe(false);
  });
});
it('creates one versioned rule per own source, toggles it, preserves retries and cancels superseded intentions',async()=>{
  const app=fixture(), rule=await app.rule();expect(rule).toMatchObject({enabled:true,version:1});expect((await app.rule()).id).toBe(rule.id);expect((await app.rule()).version).toBe(1);
  const row=await app.service.createReminder('A',{reminderRuleId:rule.id});
  expect((await app.service.configure('A',{sourceType:'TASK',sourceId,leadMinutes:60,enabled:false})).version).toBe(2);
  expect(await app.service.get('A',row.id)).toMatchObject({status:'CANCELLED',lastError:'STALE'});
  await expect(app.service.createReminder('A',{reminderRuleId:rule.id})).rejects.toMatchObject({status:409});
  expect((await app.rule()).version).toBe(3);
  await expect(app.service.configure('B',{sourceType:'TASK',sourceId,leadMinutes:1})).rejects.toMatchObject({status:404});
});
it('computes UTC antecedence and idempotent keys; concurrent creation inserts one intention/log even on late duplicate',async()=>{
  const app=fixture(),rule=await app.rule();const results=await Promise.all(Array.from({length:10},()=>app.service.createReminder('A',{reminderRuleId:rule.id})));
  expect(new Set(results.map(r=>r.id)).size).toBe(1);expect(app.rows.size).toBe(1);expect(app.logs).toHaveLength(1);expect(results[0]!.scheduledAt.toISOString()).toBe('2026-11-15T08:00:00.000Z');
  app.setTime('2026-11-15T08:30:00Z');expect((await app.service.createReminder('A',{reminderRuleId:rule.id})).id).toBe(results[0]!.id);
});
it('has separate keys for a new source validity version and recurring original occurrence identity',async()=>{
  const app=fixture(),rule=await app.rule(), first=await app.service.createReminder('A',{reminderRuleId:rule.id});
  app.setSource({...app.source()!,version:'b'.repeat(64),recurrenceRuleId:randomUUID(),recurrenceVersion:2,occurrenceDate:new Date('2026-11-15T00:00:00Z')});
  const next=await app.service.createReminder('A',{reminderRuleId:rule.id,occurrenceDate:'2026-11-15'});expect(next.id).not.toBe(first.id);expect(next.recurrenceVersion).toBe(2);
  expect(await app.service.invalidate('A',first.id)).toMatchObject({status:'CANCELLED',lastError:'STALE'});
  expect((await app.service.invalidate('A',next.id)).status).toBe('PENDING');
});
it('rejects disabled preferences, unavailable sources and scheduling outside the bounded window',async()=>{
  const app=fixture(),rule=await app.rule();app.preferences.emailEnabled=false;await expect(app.service.createReminder('A',{reminderRuleId:rule.id})).rejects.toMatchObject({status:409});
  app.preferences.emailEnabled=true;app.setSource(null);await expect(app.service.createReminder('A',{reminderRuleId:rule.id})).rejects.toMatchObject({status:409});
  app.setSource({at:new Date('2027-01-01'),version:'c'.repeat(64),timezone:'UTC',recurrenceRuleId:null,recurrenceVersion:null,occurrenceDate:null});await expect(app.service.createReminder('A',{reminderRuleId:rule.id})).rejects.toMatchObject({status:409});
  app.setSource({...app.source()!,at:new Date('2026-11-14T09:00:00Z')});await expect(app.service.createReminder('A',{reminderRuleId:rule.id})).rejects.toMatchObject({status:409});
});
it('reserves once under simulated contention and distinguishes queue acceptance from provider acceptance',async()=>{
  const app=fixture(),rule=await app.rule(),row=await app.service.createReminder('A',{reminderRuleId:rule.id});
  const claims=await Promise.allSettled([app.service.reserve('A',row.id),app.service.reserve('A',row.id)]);expect(claims.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const reserved=await app.service.get('A',row.id);expect(reserved).toMatchObject({status:'RESERVED',reservedFrom:'PENDING',attemptCount:1,sentAt:null});
  await expect(app.service.accepted('A',row.id,{leaseToken:reserved.leaseToken,providerMessageId:'msg-1'})).rejects.toMatchObject({status:409});
  expect(await app.service.published('A',row.id,reserved.leaseToken!)).toMatchObject({status:'PUBLISHED',sentAt:null,leaseToken:null});
  const delivery=await app.service.reserve('A',row.id);expect(delivery.reservedFrom).toBe('PUBLISHED');
  expect(await app.service.accepted('A',row.id,{leaseToken:delivery.leaseToken,providerMessageId:'msg-1'})).toMatchObject({status:'SENT',providerMessageId:'msg-1'});
  await expect(app.service.reserve('A',row.id)).rejects.toMatchObject({status:409});expect((await app.service.history('A',row.id)).items.map(l=>l.result)).toEqual(['CREATED','RESERVED','QUEUED','RESERVED','PROVIDER_ACCEPTED']);
});
it('records sanitized failure without retries, rejects forged/expired leases and permits explicit expiry failure only',async()=>{
  const app=fixture(),rule=await app.rule(),row=await app.service.createReminder('A',{reminderRuleId:rule.id}),claim=await app.service.reserve('A',row.id,{seconds:1});
  await expect(app.service.fail('A',row.id,{leaseToken:randomUUID(),category:'NETWORK'})).rejects.toMatchObject({status:409});
  await expect(app.service.fail('A',row.id,{leaseToken:claim.leaseToken,category:'secret raw error'})).rejects.toMatchObject({status:400});
  app.setTime('2026-11-15T08:00:01Z');await expect(app.service.published('A',row.id,claim.leaseToken!)).rejects.toMatchObject({status:409});
  await expect(app.service.reserve('A',row.id)).rejects.toMatchObject({status:409});expect(await app.service.expire('A',row.id)).toMatchObject({status:'FAILED',lastError:'LEASE_EXPIRED',leaseToken:null});
  await expect(app.service.reserve('A',row.id)).rejects.toMatchObject({status:409});
  expect((await app.service.history('A',row.id)).items.at(-1)).toMatchObject({result:'FAILED',errorCategory:'LEASE_EXPIRED'});
});
it('logs explicit provider/network failures terminally, cancel is idempotent and cannot turn SENT/FAILED into pending',async()=>{
  const app=fixture(),rule=await app.rule(),row=await app.service.createReminder('A',{reminderRuleId:rule.id}),claim=await app.service.reserve('A',row.id);
  expect(await app.service.fail('A',row.id,{leaseToken:claim.leaseToken,category:'PROVIDER_REJECTED'})).toMatchObject({status:'FAILED',lastError:'PROVIDER_REJECTED'});
  const before=app.logs.length;expect((await app.service.cancel('A',row.id)).status).toBe('FAILED');expect(app.logs).toHaveLength(before);
});
it('cancels pending or reserved stale/disabled intentions and never touches another owner',async()=>{
  const app=fixture(),rule=await app.rule(),row=await app.service.createReminder('A',{reminderRuleId:rule.id});app.preferences.emailEnabled=false;
  expect((await app.service.reserve('A',row.id)).status).toBe('CANCELLED');const before=app.logs.length;expect((await app.service.cancel('A',row.id)).status).toBe('CANCELLED');expect(app.logs).toHaveLength(before);
  for(const operation of [()=>app.service.get('B',row.id),()=>app.service.cancel('B',row.id),()=>app.service.history('B',row.id),()=>app.service.invalidate('B',row.id)])await expect(operation()).rejects.toMatchObject({status:404});
  expect((await app.service.list('B')).items).toEqual([]);
});
it('creates a unique digest per owner/local civil date, honors flags and preserves cancelled identity on recreation',async()=>{
  const app=fixture();const [first,second]=await Promise.all([app.service.createDigest('A',{date:'2026-11-15'}),app.service.createDigest('A',{date:'2026-11-15'})]);expect(first.id).toBe(second.id);expect(first.digestDate?.toISOString().slice(0,10)).toBe('2026-11-15');
  expect((await app.service.createDigest('B',{date:'2026-11-15'})).id).not.toBe(first.id);
  await app.service.cancel('A',first.id);expect((await app.service.createDigest('A',{date:'2026-11-15'})).status).toBe('CANCELLED');
  app.preferences.dailyDigestEnabled=false;await expect(app.service.createDigest('A',{date:'2026-11-16'})).rejects.toMatchObject({status:409});
});
it('handles digest DST gap/fold using the existing resolver and invalidates preference changes',async()=>{
  const app=fixture();app.preferences.timezone='America/New_York';app.preferences.dailyDigestTime='02:30';app.setTime('2026-03-08T00:00:00Z');
  await expect(app.service.createDigest('A',{date:'2026-03-08'})).rejects.toMatchObject({status:409});
  app.setTime('2026-11-01T00:00:00Z');app.preferences.dailyDigestTime='01:30';const row=await app.service.createDigest('A',{date:'2026-11-01'});expect(row.scheduledAt.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  app.preferences.dailyDigestTime='01:45';expect((await app.service.invalidate('A',row.id)).status).toBe('CANCELLED');
});
it('bounds internal lists/history with stable status filtering',async()=>{
  const app=fixture();await app.service.createDigest('A',{date:'2026-11-15'});await app.service.createDigest('A',{date:'2026-11-16'});
  const page=await app.service.list('A',{limit:'1'});expect(page.items).toHaveLength(1);expect(page.page.hasMore).toBe(true);expect((await app.service.list('A',{limit:'1',page:'2'})).page.hasMore).toBe(false);
  expect((await app.service.history('A',page.items[0]!.id,{limit:'1'})).items).toHaveLength(1);
});
