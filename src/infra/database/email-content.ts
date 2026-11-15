import type { PrismaClient } from '../../generated/prisma/client';
import type { DeliveryContent } from '../../notifications/delivery';
import type { DatabaseBindings } from './config';
import { createDashboardScope } from './dashboard-scope';
import { notificationSource } from './notification-source';
import { activityLink, reminderTemplate, digestTemplate } from '../../notifications/templates';
import { preferenceDefaults } from '../../preferences/dto';
export function createEmailContent(client: PrismaClient, bindings: DatabaseBindings & {APPLICATION_URL?:string}): DeliveryContent {
  return { async prepare(row) {
    const user = await client.user.findFirst({where:{id:row.ownerId,disabledAt:null},select:{email:true}});
    if (!user) throw new Error('Notification owner unavailable');
    if (row.type === 'DAILY_DIGEST') {
      const summary = await createDashboardScope(bindings)(s => s.get(row.ownerId,{date:row.digestDate!.toISOString().slice(0,10),limit:20},row.timezone));
      return {to:user.email,...digestTemplate(summary,bindings.APPLICATION_URL)};
    }
    const template = await client.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${row.ownerId}::uuid FOR UPDATE`;
      const preferences = await tx.userPreferences.findUnique({where:{userId:row.ownerId}}) ?? preferenceDefaults;
      const source = await notificationSource(tx,row.ownerId,{sourceType:row.sourceType!,sourceId:row.sourceId!},preferences,row.occurrenceDate?.toISOString().slice(0,10));
      if (!source) throw new Error('Notification source unavailable');
      const where = {id:row.sourceId!,ownerId:row.ownerId};
      const entity = row.sourceType === 'TASK' ? await tx.task.findFirst({where,select:{title:true,dueDate:true}})
        : row.sourceType === 'EVENT' ? await tx.event.findFirst({where,select:{title:true}})
        : await tx.publication.findFirst({where,select:{title:true}});
      if (!entity) throw new Error('Notification source unavailable');
      const date = row.sourceType === 'TASK' ? (row.occurrenceDate?.toISOString().slice(0,10) ?? ('dueDate' in entity ? (entity.dueDate as Date).toISOString().slice(0,10) : '')) : source.at.toISOString();
      return reminderTemplate({type:row.sourceType!,title:entity.title,date,timezone:source.timezone,
        ...(bindings.APPLICATION_URL ? {url:activityLink(bindings.APPLICATION_URL,row.sourceType!,row.sourceId!)!} : {})});
    }, {timeout:15000,maxWait:10000});
    return {to:user.email,...template};
  } };
}
