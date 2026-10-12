import { writeFileSync } from 'node:fs';
import { message } from '../lib/helper.ts';

// A compiler must copy this module, never evaluate it.
if (process.env.AGENTFORGE_EXECUTION_MARKER) {
  writeFileSync(process.env.AGENTFORGE_EXECUTION_MARKER, 'extension evaluated');
}
export default function register(pi: { on: (event: string, handler: () => void) => void }) {
  pi.on('session_start', () => void message);
}
