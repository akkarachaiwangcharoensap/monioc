import type React from 'react';

/** A small inline spinning icon, used in buttons during async operations. */
export default function InlineSpinner(): React.ReactElement {
	return <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>;
}
