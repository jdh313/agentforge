import { readFileSync } from 'node:fs';
import { Type } from '@earendil-works/pi-ai';
import { marker } from '../lib/helper.js';

export default function (pi) {
  pi.registerFlag('af-acceptance-loaded', {
    description: 'Acceptance extension is loaded',
    type: 'boolean',
    default: false,
  });
  // Factories register only: no timers, processes, watchers, or external writes.
  let shutdown = false;
  pi.on('session_start', () => {
    shutdown = false;
    marker('start', readFileSync(new URL('../assets/message.txt', import.meta.url), 'utf8').trim());
  });
  pi.on('session_shutdown', () => {
    if (shutdown) return;
    shutdown = true;
    marker('shutdown');
  });
  pi.on('tool_call', (event) => {
    if (event.toolName === 'af_acceptance_target') {
      marker('blocked');
      return { block: true, reason: 'acceptance guard denied target' };
    }
  });
  pi.registerCommand('af-acceptance', {
    description: 'Record a command without contacting a model',
    handler: async () => marker('command'),
  });
  pi.registerTool({
    name: 'af_acceptance_target',
    label: 'Acceptance target',
    description: 'Must never execute in acceptance',
    parameters: Type.Object({}),
    async execute() {
      marker('executed');
      return { content: [{ type: 'text', text: 'unexpected execution' }], details: undefined };
    },
  });
  pi.registerTool({
    name: 'af_acceptance_probe',
    label: 'Acceptance probe',
    description: 'Exercise nested runtime tool dispatch deterministically',
    parameters: Type.Object({}),
    async execute(_id, _args, _signal, _onUpdate, ctx) {
      const outcome = await ctx.executeTool('af_acceptance_target', {});
      marker('outcome', JSON.stringify(outcome));
      return { content: [{ type: 'text', text: JSON.stringify(outcome) }], details: outcome };
    },
  });
}
