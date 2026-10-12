import { appendFileSync } from 'node:fs';
import { value } from 'af-acceptance-tiny-dependency';

export default function (pi) {
  pi.on('session_start', () => {
    const marker = process.env.AF_ACCEPTANCE_MARKER;
    if (!marker) throw new Error('Acceptance marker missing');
    appendFileSync(marker, `${JSON.stringify({ kind: 'dependency', value })}\n`);
  });
}
