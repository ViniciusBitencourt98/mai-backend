import type { CalendarItem } from '../calendar/dto';
import type { DashboardService } from '../services/dashboard.service';
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
const labels = { TASK: 'Tarefa', EVENT: 'Evento', PUBLICATION: 'Publicação editorial' };
export function activityLink(base: string | undefined, type: keyof typeof labels, id: string) {
  if (!base) return undefined;
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid application URL');
  return new URL(`/app/${{ TASK:'tarefas', EVENT:'eventos', PUBLICATION:'publicacoes' }[type]}/${encodeURIComponent(id)}`, url).href;
}
export function reminderTemplate(input: { type: keyof typeof labels; title: string; date: string; timezone: string; end?: string; url?: string }) {
  const time = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? `${input.date} (sem horário)`
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: input.timezone }).format(new Date(input.date)) + ` (${input.timezone})`;
  const lines = ['Projeto MAI', `${labels[input.type]}: ${input.title}`, time];
  if (input.end) lines.push('Término: ' + new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short', timeZone:input.timezone }).format(new Date(input.end)));
  if (input.url) lines.push(input.url);
  return { subject: `MAI — ${labels[input.type]}: ${input.title}`.slice(0, 180), text: lines.join('\n'), html: lines.map(line => `<p>${escapeHtml(line)}</p>`).join('') };
}
export function digestTemplate(summary: Awaited<ReturnType<DashboardService['get']>>, base?: string) {
  const format = (item: CalendarItem) => reminderTemplate({ type:item.type, title:item.title, timezone:item.timezone,
    date:item.type === 'TASK' ? item.date : item.type === 'EVENT' ? item.startAt : item.scheduledAt,
    ...(item.type === 'EVENT' ? {end:item.endAt} : {}), ...(base ? {url:activityLink(base,item.type,item.masterId)!} : {}) });
  const today = summary.today.items.filter(i => i.type === 'TASK' ? !i.completed : i.type !== 'PUBLICATION' || i.status !== 'PUBLISHED');
  const sections = [{title:'Hoje', items:today, more:summary.today.hasMore}, {title:'Tarefas atrasadas (últimos 30 dias)', items:summary.overdueTasks.items, more:summary.overdueTasks.hasMore}];
  const heading = `Projeto MAI — Resumo de ${summary.date} (${summary.timezone})`;
  const text = [heading], html = [`<h1>${escapeHtml(heading)}</h1>`];
  for (const section of sections) {
    text.push(section.title); html.push(`<h2>${escapeHtml(section.title)}</h2>`);
    if (!section.items.length) { text.push('Nenhuma atividade.'); html.push('<p>Nenhuma atividade.</p>'); }
    for (const item of section.items) { const message = format(item); text.push(message.text); html.push(message.html); }
    if (section.more) { text.push('Há mais atividades. Consulte a agenda.'); html.push('<p>Há mais atividades. Consulte a agenda.</p>'); }
  }
  return { subject:`MAI — Resumo diário ${summary.date}`, text:text.join('\n\n'), html:html.join('') };
}
