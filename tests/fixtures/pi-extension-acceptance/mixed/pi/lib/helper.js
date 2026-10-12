import { appendFileSync } from 'node:fs';

export function marker(kind, value = '') {
  const path = process.env.AF_ACCEPTANCE_MARKER;
  if (!path) throw new Error('Acceptance marker path missing');
  appendFileSync(path, `${JSON.stringify({ kind, value })}\n`);
}

// If conventional discovery ever treats this helper as an extension, fail loudly.
export default function () {
  throw new Error('Undeclared helper was activated as an extension');
}
