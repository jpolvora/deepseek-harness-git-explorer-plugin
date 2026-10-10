/**
 * Group changed files into the directory tree the panel renders.
 *
 * The shape follows VS Code's Source Control view: one row per directory, files nested
 * under it, directories before files, natural case-insensitive ordering, and a
 * directory chain with a single child compacted into one row (`assets/css` rather than
 * two indented rows). This module is pure — no React, no services — so the grouping is
 * unit-testable on its own.
 */
import type { GitChange } from '../types.js';
/** One row of the change tree. */
export interface ChangeTreeNode {
    kind: 'directory' | 'file';
    /** The row's label: the compacted directory chain, or the file name. */
    name: string;
    /** Repository-relative path this row stands for. */
    path: string;
    children: ChangeTreeNode[];
    /** The change this file row renders; absent on directories. */
    change?: GitChange;
}
/**
 * Build the tree for one group of changes.
 *
 * @param changes - the group's entries, in any order.
 * @returns the root rows.
 */
export declare function buildChangeTree(changes: readonly GitChange[]): ChangeTreeNode[];
/**
 * List every directory path a tree contains.
 *
 * @param nodes - the root rows.
 * @returns the directory paths, parents before children.
 */
export declare function directoryPaths(nodes: readonly ChangeTreeNode[]): string[];
