/**
 * Resolve the directory git runs in for one Session.
 *
 * @param ctx - the host context carrying the Session store and friends.
 * @param sessionId - the Session identity received on the wire.
 * @param requestRoot - the working directory the panel offered, if any.
 * @returns the resolved root and which link supplied it.
 */
export async function resolveRoot(ctx, sessionId, requestRoot) {
    const host = ctx;
    const sessions = host.sessions ?? host.get?.('sessions');
    const live = sessions?.get(sessionId);
    const sessionFound = live !== undefined;
    const headerRoot = live?.header?.cwd;
    if (headerRoot !== undefined && headerRoot !== '') {
        return { root: headerRoot, source: 'header', sessionFound, note: '' };
    }
    const persistence = host.get?.('sessionPersistence');
    if (persistence !== undefined) {
        try {
            const stored = await persistence.stat(sessionId);
            const storedRoot = stored?.header?.cwd;
            if (storedRoot !== undefined && storedRoot !== '') {
                return { root: storedRoot, source: 'persistence', sessionFound, note: '' };
            }
        }
        catch {
            // A persistence miss is not a failure: the chain moves on.
        }
    }
    if (requestRoot !== '')
        return { root: requestRoot, source: 'request', sessionFound, note: '' };
    const policy = host.get?.('sandboxPolicy');
    if (typeof policy?.workspaceRoot === 'string' && policy.workspaceRoot !== '') {
        return { root: policy.workspaceRoot, source: 'sandboxPolicy', sessionFound, note: '' };
    }
    return {
        root: null,
        source: 'none',
        sessionFound,
        note: sessionFound
            ? 'this Session has no working directory'
            : 'the host could not resolve this Session or its working directory',
    };
}
//# sourceMappingURL=repo.js.map