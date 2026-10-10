/**
 * The Git tab's chip in the right-sidebar tab strip.
 *
 * The title seat renders live content, while the text captured when the tab opens
 * comes from the tab type's `title()`. M1 adds the live branch name and a change
 * count here; M0 shows the stable label.
 */
import * as React from 'react';
/**
 * Render the chip content.
 *
 * @returns the chip label.
 */
export declare function GitTitle(): React.ReactElement;
