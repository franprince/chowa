/**
 * Antigravity Bridge
 *
 * Thin integration surface between Antigravity's agent conventions
 * and Chowa's CLI/library API. This module imports from core only —
 * the dependency flows one direction: integrations → core.
 *
 * The bridge translates between Antigravity's request/response shape
 * and Chowa's canonical types, so the core library never needs to
 * know about Antigravity.
 */

import { ChowaClient } from '../../client.js';
import type { CallResult, CanonicalTool, CanonicalMessage } from '../../core/types.js';
import { resolve } from '../../router/router.js';
import type { RoutingPolicy, TaskProfile } from '../../router/types.js';

// ---------------------------------------------------------------------------
// Antigravity request/response shapes
// ---------------------------------------------------------------------------

/**
 * A request from an Antigravity agent session.
 * This mirrors what Antigravity sends when invoking an external tool/skill.
 */
export interface AntigravityRequest {
  /** The action to perform. */
  readonly action: 'call' | 'commit' | 'pr' | 'route';

  /** Provider to use (optional — will be resolved by router if omitted). */
  readonly provider?: string;

  /** Model to use (optional — will be resolved by router if omitted). */
  readonly model?: string;

  /** Task profile for routing (optional). */
  readonly taskProfile?: TaskProfile;

  /** Tools available for this call (for 'call' action). */
  readonly tools?: readonly CanonicalTool[];

  /** Messages for this call (for 'call' action). */
  readonly messages?: readonly CanonicalMessage[];

  /** Base branch for PR description (for 'pr' action). */
  readonly baseBranch?: string;
}

/**
 * Response sent back to the Antigravity agent.
 */
export interface AntigravityResponse {
  readonly success: boolean;
  readonly action: string;
  readonly data?: CallResult | Record<string, unknown>;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export class AntigravityBridge {
  private readonly client: ChowaClient;
  private readonly policy: RoutingPolicy;

  constructor(client: ChowaClient, policy: RoutingPolicy) {
    this.client = client;
    this.policy = policy;
  }

  /**
   * Handle an incoming request from an Antigravity agent.
   * Routes to the appropriate Chowa functionality.
   */
  async handle(request: AntigravityRequest): Promise<AntigravityResponse> {
    try {
      switch (request.action) {
        case 'call':
          return await this.handleCall(request);
        case 'route':
          return this.handleRoute(request);
        case 'commit':
          return this.handleCommit();
        case 'pr':
          return this.handlePR(request);
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

  private async handleCall(request: AntigravityRequest): Promise<AntigravityResponse> {
    // Resolve provider/model via router if not explicitly provided
    let provider = request.provider;
    let model = request.model;

    if (!provider || !model) {
      const profile: TaskProfile = request.taskProfile ?? {
        kind: 'mechanical',
        estimatedComplexity: 'low',
      };
      const decision = resolve(profile, this.policy);
      provider = provider ?? decision.target.provider;
      model = model ?? decision.target.model;
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

  private handleRoute(request: AntigravityRequest): AntigravityResponse {
    const profile: TaskProfile = request.taskProfile ?? {
      kind: 'mechanical',
      estimatedComplexity: 'low',
    };

    const decision = resolve(profile, this.policy);

    return {
      success: true,
      action: 'route',
      data: {
        target: decision.target,
        matchedRule: decision.matchedRule,
        reason: decision.reason,
      },
    };
  }

  private async handleCommit(): Promise<AntigravityResponse> {
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

  private async handlePR(request: AntigravityRequest): Promise<AntigravityResponse> {
    const { GitOps } = await import('../../git/gitOps.js');
    const { generatePRDescription } = await import('../../git/prDescription.js');

    const baseBranch = request.baseBranch ?? 'main';
    const gitOps = new GitOps();

    const commits = await gitOps.getCommitHistory(baseBranch);
    const baseBranchDiff = await gitOps.getDiffAgainstBase(baseBranch);

    const prDescription = await generatePRDescription(
      commits,
      baseBranchDiff,
      this.client,
      this.policy,
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

