import chalk from 'chalk';
import { Store } from '../core/store.js';
import { getDbPath } from '../utils/config.js';
import type { LinkType } from '../types/index.js';

export async function manageLink(
  sourceId: string,
  targetId: string,
  options: { type: string; remove?: boolean }
): Promise<void> {
  const store = new Store(getDbPath());

  try {
    // Validate both issues exist
    const source = store.getIssue(sourceId);
    const target = store.getIssue(targetId);

    if (!source) {
      console.error(chalk.red(`Error: Source issue '${sourceId}' not found`));
      process.exit(1);
    }

    if (!target) {
      console.error(chalk.red(`Error: Target issue '${targetId}' not found`));
      process.exit(1);
    }

    const linkType = options.type as LinkType;

    // Validate link type
    const validTypes: LinkType[] = ['blocks', 'depends_on', 'duplicates', 'related_to'];
    if (!validTypes.includes(linkType)) {
      console.error(chalk.red(`Error: Invalid link type '${options.type}'`));
      console.error(chalk.dim(`Valid types: ${validTypes.join(', ')}`));
      process.exit(1);
    }

    // Use resolved full IDs
    const resolvedSourceId = source.id;
    const resolvedTargetId = target.id;

    if (options.remove) {
      // Remove the link
      const deleted = store.deleteLinkByDetails(resolvedSourceId, resolvedTargetId, linkType);
      if (deleted) {
        console.log(
          chalk.green(
            `Removed link: ${chalk.dim(resolvedSourceId.slice(0, 8))} ${chalk.yellow(linkType)} → ${chalk.dim(resolvedTargetId.slice(0, 8))}`
          )
        );
      } else {
        console.error(chalk.red('Error: Link not found'));
        process.exit(1);
      }
    } else {
      // Check if link already exists
      const existing = store.findLink(resolvedSourceId, resolvedTargetId, linkType);
      if (existing) {
        console.error(chalk.yellow('Warning: This link already exists'));
        return;
      }

      // Prevent self-links
      if (resolvedSourceId === resolvedTargetId) {
        console.error(chalk.red('Error: Cannot link an issue to itself'));
        process.exit(1);
      }

      // Create the link
      const link = store.createLink({
        sourceId: resolvedSourceId,
        targetId: resolvedTargetId,
        linkType,
      });

      console.log(chalk.green('Created link:'));
      console.log(
        `  ${chalk.dim(sourceId.slice(0, 8))} "${source.title}" ${chalk.yellow(linkType)} → ${chalk.dim(targetId.slice(0, 8))} "${target.title}"`
      );

      // Show what this means
      const explanation = getLinkExplanation(linkType, source.title, target.title);
      console.log(chalk.dim(`  ${explanation}`));
    }
  } finally {
    store.close();
  }
}

function getLinkExplanation(linkType: LinkType, sourceTitle: string, targetTitle: string): string {
  switch (linkType) {
    case 'blocks':
      return `"${sourceTitle}" must be completed before "${targetTitle}" can proceed`;
    case 'depends_on':
      return `"${sourceTitle}" cannot proceed until "${targetTitle}" is completed`;
    case 'duplicates':
      return `"${sourceTitle}" is a duplicate of "${targetTitle}"`;
    case 'related_to':
      return `"${sourceTitle}" is related to "${targetTitle}"`;
  }
}
