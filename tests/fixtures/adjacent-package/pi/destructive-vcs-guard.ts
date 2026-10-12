import { contractLabel } from './policy/destructive-vcs-policy.ts';

// A static entry point; compile/check must preserve, not evaluate, this module.
export default function register() {
  return contractLabel;
}
