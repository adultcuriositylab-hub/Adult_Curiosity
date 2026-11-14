import { createNoteHandler } from '../../server/note-feed.js';
const handle = createNoteHandler();
export async function onRequest(context) {
  return handle({ request: context.request, waitUntil: promise => context.waitUntil(promise) });
}
