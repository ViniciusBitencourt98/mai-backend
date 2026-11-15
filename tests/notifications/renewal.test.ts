import { expect,it,vi,afterEach } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { renewReminders } from '../../src/infra/database/reminder-renewal';
import { synchronizeReminders,lockReminderOwner } from '../../src/infra/database/domain-reminders';
import { HttpError } from '../../src/errors/http-error';
vi.mock('../../src/infra/database/domain-reminders',()=>({synchronizeReminders:vi.fn(),lockReminderOwner:vi.fn()}));
afterEach(()=>vi.clearAllMocks());
function fixture(){
 let cursor:string|null=null;
 const rules=[{id:'a',ownerId:'u',sourceType:'TASK',sourceId:'t'},{id:'b',ownerId:'v',sourceType:'EVENT',sourceId:'e'}];
 const tx={$executeRaw:vi.fn(async(strings:TemplateStringsArray,...values:unknown[])=>{if(strings.join('').startsWith('UPDATE'))cursor=values[0] as string;return 1;}),
 $queryRaw:vi.fn(async()=>[{last_rule_id:cursor}]),reminderRule:{findMany:vi.fn(async({where}:{where:{id?:{gt:string}}})=>rules.filter(r=>!where.id||r.id>where.id.gt).slice(0,1))}};
 const transaction=vi.fn(async(fn:(t:typeof tx)=>Promise<unknown>)=>{const before=cursor;try{return await fn(tx);}catch(e){cursor=before;throw e;}});
 return {tx,transaction,client:{$transaction:transaction} as unknown as PrismaClient,cursor:()=>cursor};
}
it('continues across Cron runs, wraps the keyset, and bounds renewal work',async()=>{
 const f=fixture(),now=new Date();await renewReminders(f.client,now,1);expect(f.cursor()).toBe('a');
 await renewReminders(f.client,now,1);expect(f.cursor()).toBe('b');await renewReminders(f.client,now,1);expect(f.cursor()).toBe('a');
 expect(vi.mocked(synchronizeReminders).mock.calls.map(c=>c[1])).toEqual(['u','v','u']);
 expect(lockReminderOwner).toHaveBeenCalledWith(f.tx,'u');
 expect(f.tx.reminderRule.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({enabled:true,owner:{disabledAt:null}}),take:1}));
});
it('does not advance progress after a database failure in renewal',async()=>{
 const f=fixture();vi.mocked(synchronizeReminders).mockRejectedValueOnce(new Error('DB failed'));
 await expect(renewReminders(f.client,new Date(),1)).rejects.toThrow('DB failed');expect(f.cursor()).toBeNull();
 expect(f.tx.$executeRaw.mock.calls.some(c=>c[0].join('').startsWith('UPDATE'))).toBe(false);
});
it('rolls a limit failure back to the savepoint and advances past it',async()=>{
 const f=fixture();vi.spyOn(console,'info').mockImplementation(()=>{});
 vi.mocked(synchronizeReminders).mockRejectedValueOnce(new HttpError(409,'NOTIFICATION_LIMIT','Private details'));
 await renewReminders(f.client,new Date(),2);expect(f.cursor()).toBe('b');
 const calls=f.tx.$executeRaw.mock.calls.map(c=>c[0].join(''));expect(calls).toContain('ROLLBACK TO SAVEPOINT reminder_renewal');
 vi.restoreAllMocks();
});
it('rejects unbounded batch settings before opening a transaction',async()=>{
 const f=fixture();for(const limit of [0,101,1.5])await expect(renewReminders(f.client,new Date(),limit)).rejects.toThrow();expect(f.transaction).not.toHaveBeenCalled();
});
it('does not repeatedly renew a small set within the same Cron batch',async()=>{
 const f=fixture();await renewReminders(f.client,new Date(),20);expect(synchronizeReminders).toHaveBeenCalledTimes(2);
});
