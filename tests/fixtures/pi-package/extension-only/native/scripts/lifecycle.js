const { writeFileSync } = require('node:fs');
if (process.env.AGENTFORGE_EXECUTION_MARKER) {
  writeFileSync(process.env.AGENTFORGE_EXECUTION_MARKER, 'lifecycle executed');
}
