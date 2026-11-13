import { createDatabaseClient } from './client';
import { createNoteRepository } from './note-persistence';
import { NoteService } from '../../services/note.service';
import type { DatabaseBindings } from './config';
export function createNoteScope(bindings: DatabaseBindings) {
  return async function withNotes<T>(operation: (service: NoteService) => Promise<T>) {
    const client = createDatabaseClient(bindings.DATABASE_URL);
    try { return await operation(new NoteService(createNoteRepository(client))); }
    finally { await client.$disconnect(); }
  };
}
