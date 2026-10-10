/** Compare two labels naturally, ignoring case. */
function compareNames(left, right) {
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}
/** Turn one assembled directory into rows: directories first, then files by name. */
function toNodes(directory) {
    const directories = [...directory.directories.values()]
        .map((child) => compact(child))
        .sort((left, right) => compareNames(left.name, right.name));
    const files = [...directory.files].sort((left, right) => compareNames(left.name, right.name));
    return [...directories, ...files];
}
/**
 * Fold a chain of single-child directories into one row.
 *
 * @param directory - the directory to compact.
 * @returns the directory row, with its label carrying the folded chain.
 */
function compact(directory) {
    let label = directory.name;
    let current = directory;
    while (current.directories.size === 1 && current.files.length === 0) {
        const only = [...current.directories.values()][0];
        if (only === undefined)
            break;
        label = `${label}/${only.name}`;
        current = only;
    }
    return {
        kind: 'directory',
        name: label,
        path: current.path,
        children: toNodes(current),
    };
}
/**
 * Build the tree for one group of changes.
 *
 * @param changes - the group's entries, in any order.
 * @returns the root rows.
 */
export function buildChangeTree(changes) {
    const root = { name: '', path: '', directories: new Map(), files: [] };
    for (const change of changes) {
        const segments = change.path.split('/').filter((segment) => segment !== '');
        const fileName = segments.pop() ?? change.path;
        let node = root;
        for (const segment of segments) {
            const path = node.path === '' ? segment : `${node.path}/${segment}`;
            let next = node.directories.get(segment);
            if (next === undefined) {
                next = { name: segment, path, directories: new Map(), files: [] };
                node.directories.set(segment, next);
            }
            node = next;
        }
        node.files.push({ kind: 'file', name: fileName, path: change.path, children: [], change });
    }
    return toNodes(root);
}
/**
 * List every directory path a tree contains.
 *
 * @param nodes - the root rows.
 * @returns the directory paths, parents before children.
 */
export function directoryPaths(nodes) {
    const paths = [];
    for (const node of nodes) {
        if (node.kind !== 'directory')
            continue;
        paths.push(node.path);
        paths.push(...directoryPaths(node.children));
    }
    return paths;
}
//# sourceMappingURL=change-tree.js.map