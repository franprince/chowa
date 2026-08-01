/**
 * Claude Code Bridge
 *
 * Integration surface between Claude Code's agent CLI / tool harness
 * and Chowa's normalization, routing, and git workflow engine.
 *
 * Dependencies flow one direction: integrations → core.
 */

import { ChowaClient } from '../../client.js';
import type { CallResult, CanonicalTool, CanonicalMessage } from '../../core/types.js';
import { resolve, resolveModelTier } from '../../router/router.js';
import type { RoutingPolicy, TaskProfile } from '../../router/types.js';

export interface ClaudeCodeRequest {
  readonly action: 'call' | 'commit' | 'pr' | 'route' | 'models';
  readonly provider?: string;
  readonly model?: string;
  readonly taskProfile?: TaskProfile;
  readonly tools?: readonly CanonicalTool[];
  readonly messages?: readonly CanonicalMessage[];
  readonly baseBranch?: string;
}

export interface ClaudeCodeResponse {
  readonly success: boolean;
  readonly action: string;
  readonly data?: CallResult | Record<string, unknown>;
  readonly error?: string;
}

export class ClaudeCodeBridge {
  private readonly client: ChowaClient;
  private readonly policy: RoutingPolicy;

  constructor(client: ChowaClient, policy: RoutingPolicy) {
    this.client = client;
    this.policy = policy;
  }

  async handle(request: ClaudeCodeRequest): Promise<ClaudeCodeResponse> {
    try {
      switch (request.action) {
        case 'call':
          return await this.handleCall(request);
        case 'route':
          return this.handleRoute(request);
        case 'models':
          return this.handleModels(request);
        case 'commit':
          return await this.handleCommit();
        case 'pr':
          return await this.handlePR(request);
        default:
          return {
            success: false,
            action: request.action,
            error: `Unknown action: ${request.action}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        action: request.action,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private handleModels(request: ClaudeCodeRequest): ClaudeCodeResponse {
    const models = this.client.getAvailableModels(request.provider);
    return {
      success: true,
      action: 'models',
      data: {
        models,
      },
    };
  }

  private handleRoute(request: ClaudeCodeRequest): ClaudeCodeResponse {
    const profile: TaskProfile = request.taskProfile ?? {
      kind: 'mechanical',
      estimatedComplexity: 'low',
    };

    const decision = resolve(profile, this.policy);
    const availableModels = this.client.getAvailableModels();
    const resolvedTarget = resolveModelTier(decision.target, availableModels);

    return {
      success: true,
      action: 'route',
      data: {
        target: resolvedTarget,
        originalTarget: decision.target,
        matchedRule: decision.matchedRule,
        reason: decision.reason,
      },
    };
  }

  private async handleCall(request: ClaudeCodeRequest): Promise<ClaudeCodeResponse> {
    let provider = request.provider;
    let model = request.model;

    if (!provider || !model) {
      const profile: TaskProfile = request.taskProfile ?? {
        kind: 'mechanical',
        estimatedComplexity: 'low',
      };
      const decision = resolve(profile, this.policy);
      const availableModels = this.client.getAvailableModels();
      const resolvedTarget = resolveModelTier(decision.target, availableModels);

      provider = provider ?? resolvedTarget.provider;
      model = model ?? resolvedTarget.model;
    }

    const result = await this.client.call({
      provider,
      model,
      tools: request.tools ?? [],
      messages: request.messages ?? [],
    });

    return {
      success: true,
      action: 'call',
      data: result,
    };
  }

  private async handleCommit(): Promise<ClaudeCodeResponse> {
    const { GitOps } = await import('../../git/gitOps.js');
    const { splitDiff } = await import('../../git/diffSplitter.js');
    const { generateCommitMessage } = await import('../../git/commitMessage.js');

    const gitOps = new GitOps();
    const diff = (await gitOps.getDiff()) || (await gitOps.getStagedDiff());

    if (!diff.trim()) {
      return {
        success: true,
        action: 'commit',
        data: {
          message: 'No uncommitted changes detected.',
          clusters: [],
        },
      };
    }

    const clusters = splitDiff(diff);
    const results = [];

    for (const cluster of clusters) {
      const message = await generateCommitMessage(cluster, this.client, this.policy);
      results.push({
        id: cluster.id,
        files: cluster.files,
        message,
      });
    }

    return {
      success: true,
      action: 'commit',
      data: {
        clusters: results,
      },
    };
  }

  private async handlePR(request: ClaudeCodeRequest): Promise<ClaudeCodeResponse> {
    const { GitOps } = await import('../../git/gitOps.js');
    const { generatePRDescription } = await import('../../git/prDescription.js');

    const baseBranch = request.baseBranch ?? 'main';
    const gitOps = new GitOps();

    const currentBranch = await gitOps.getCurrentBranch();
    const commits = await gitOps.getCommitHistory(baseBranch);
    const baseBranchDiff = await gitOps.getDiffAgainstBase(baseBranch);

    const prDescription = await generatePRDescription(
      commits,
      baseBranchDiff,
      this.client,
      this.policy,
      currentBranch,
    );

    return {
      success: true,
      action: 'pr',
      data: {
        baseBranch,
        prDescription,
      },
    };
  }
}
