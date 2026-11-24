/** Michelin mode — only places the guide lists: catalog places with a Michelin
 * distinction, or (live agent) a guide.michelin.com URL from search. */

export function isMichelinIntent(intent: string | undefined): boolean {
  return intent?.toLowerCase().includes('michelin') ?? false;
}

export function isMichelinGuideUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'guide.michelin.com';
  } catch {
    return false;
  }
}

type MichelinOption = {
  michelin_guide_url?: string;
  michelin_distinction?: string;
  [key: string]: unknown;
};

export function filterMichelinVerifiedOptions<T extends MichelinOption>(options: T[]): T[] {
  return options.filter(
    (option) =>
      (typeof option.michelin_distinction === 'string' && option.michelin_distinction.length > 0) ||
      (typeof option.michelin_guide_url === 'string' && isMichelinGuideUrl(option.michelin_guide_url)),
  );
}

export function applyMichelinModeToUi(
  textOut: string,
  uiOut: Record<string, unknown> | null,
  intent: string | undefined,
): {text: string; ui: Record<string, unknown> | null} {
  if (!isMichelinIntent(intent) || uiOut?.interactive == null) {
    return {text: textOut, ui: uiOut};
  }

  const interactive = uiOut.interactive as Record<string, unknown>;
  if (interactive.type !== 'options' || !Array.isArray(interactive.options)) {
    return {text: textOut, ui: uiOut};
  }

  const allOptions = interactive.options as MichelinOption[];
  const verified = filterMichelinVerifiedOptions(allOptions);

  if (verified.length === 0) {
    const fallbackText =
      textOut.trim().length > 0
        ? textOut
        : "I couldn't verify any listings on guide.michelin.com for that search — Michelin mode only shows Guide-backed restaurants.";
    return {
      text: fallbackText,
      ui: {
        ...uiOut,
        interactive: {
          ...interactive,
          title: 'No Michelin Guide matches verified',
          options: [],
          pagination: {page: 0, has_more: false, total: 0},
        },
      },
    };
  }

  // All of them guide-listed (catalog results): keep the paging as it is.
  if (verified.length === allOptions.length) return {text: textOut, ui: uiOut};

  const pagination = interactive.pagination as Record<string, unknown> | undefined;
  return {
    text: textOut,
    ui: {
      ...uiOut,
      interactive: {
        ...interactive,
        options: verified,
        pagination:
          pagination != null
            ? {...pagination, total: verified.length, has_more: false}
            : {page: 0, has_more: false, total: verified.length},
      },
    },
  };
}
