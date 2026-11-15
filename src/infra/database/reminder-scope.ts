import {createDatabaseClient} from './client';
import type {DatabaseBindings} from './config';
import type {ReminderDependencies} from '../../services/reminder.service';
import {NotificationService} from '../../services/notification.service';
import {createNotificationTransactionRepository} from './notification-persistence';
import {getReminder,lockReminderOwner,synchronizeReminders} from './domain-reminders';
export function createReminderDependencies(bindings:DatabaseBindings):ReminderDependencies{
 const run=async<T>(operation:(tx:import('../../generated/prisma/client').Prisma.TransactionClient)=>Promise<T>)=>{const client=createDatabaseClient(bindings.DATABASE_URL);try{return await client.$transaction(operation,{timeout:30000,maxWait:10000});}finally{await client.$disconnect();}};
 return {
  get:(owner,ref)=>run(async tx=>{await lockReminderOwner(tx,owner);return getReminder(tx,owner,ref);}),
  set:(owner,ref,input)=>run(async tx=>{await lockReminderOwner(tx,owner);const service=new NotificationService(createNotificationTransactionRepository(tx));await service.configure(owner,{...ref,...input});await synchronizeReminders(tx,owner,ref);return getReminder(tx,owner,ref);}),
 };
}
