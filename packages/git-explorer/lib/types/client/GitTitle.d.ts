/**
 * The Git tab's chip in the right-sidebar tab strip.
 *
 * The title seat renders live content, while the text captured when the tab opens comes
 * from the tab type's `title()`. Its one rule lives in a CSS Module, which is also the
 * smoke test for the client build's module-CSS pipeline.
 */
import * as React from 'react';
/**
 * Render the chip content.
 *
 * @returns the chip label.
 */
export declare function GitTitle(): React.ReactElement;
