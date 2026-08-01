/**
 * Git module barrel export.
 */

export type {
  DiffHunk,
  DiffCluster,
  CommitInfo,
  PRDescription,
  ClusterStrategy,
} from './types.js';

export {
  splitDiff,
  parseDiff,
  FileBasedClusterStrategy,
} from './diffSplitter.js';

export {
  generateCommitMessage,
  CONVENTIONAL_COMMIT_REGEX,
} from './commitMessage.js';

export { generatePRDescription } from './prDescription.js';

export { GitOps } from './gitOps.js';
