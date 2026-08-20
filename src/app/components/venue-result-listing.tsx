'use client';

import {useState, type CSSProperties, type MouseEvent, type ReactNode} from 'react';
import {Sparkles} from 'lucide-react';
import {Button} from '@astryxdesign/core/Button';
import {
  enrichVenueOption,
  formatDietaryBadge,
  formatMichelinLine,
  formatRatingsLine,
  formatSocialProof,
  formatVenueAvailabilityLine,
  resolveMenuAction,
  venueAiWriteUps,
  type DietaryNeeds,
  type VenueOptionCard,
} from '@/lib/venue-options';
import {formatPersonalizationBadge, getUserMemory, type UserMemory} from '@/lib/user-memory';
import styles from './venue-result-listing.module.css';

function stopCardSelect(event: MouseEvent) {
  event.stopPropagation();
}

function openExternalLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function IconCheck({className}: {className?: string}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSparkle({className}: {className?: string}) {
  return <Sparkles className={className} size={14} strokeWidth={1.8} aria-hidden />;
}

function IconThumb({className}: {className?: string}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0h5.2a2 2 0 0 0 1.9-1.4l1.1-3.5a1.5 1.5 0 0 0-1.4-2h-2.3L10 8.5V11Zm0 9h7.5a2 2 0 0 0 2-1.7l.7-4.3a2 2 0 0 0-2-2.3H7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShare({className}: {className?: string}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12M8 7l4-4 4 4M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUser({className}: {className?: string}) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 19.5c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MetaRow({icon, children}: {icon: ReactNode; children: ReactNode}) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaRowIcon}>{icon}</span>
      <p className={styles.metaRowText}>{children}</p>
    </div>
  );
}

const READ_MORE_MIN_CHARS = 96;

function ExpandableAiBlurb({text}: {text: string}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = text.length > READ_MORE_MIN_CHARS;

  return (
    <div className={styles.aiBlurbBlock}>
      <MetaRow icon={<IconSparkle />}>
        <span
          className={
            expanded || !canExpand
              ? styles.aiBlurbText
              : `${styles.aiBlurbText} ${styles.aiBlurbTextClamped}`
          }>
          {text}
        </span>
      </MetaRow>
      {canExpand && (
        <button
          type="button"
          className={styles.readMore}
          onClick={(event) => {
            stopCardSelect(event);
            setExpanded((open) => !open);
          }}>
          {expanded ? 'Show less' : 'Read more…'}
        </button>
      )}
    </div>
  );
}

function VenueListActions({
  onBookTable,
  onViewMenu,
  hasMenuLink,
}: {
  onBookTable: () => void;
  onViewMenu: () => void;
  hasMenuLink: boolean;
}) {
  const grow: CSSProperties = {width: '100%'};

  return (
    <div className={styles.actions} onClick={stopCardSelect}>
      <div className={styles.actionGrow}>
        <Button label="Book a table" variant="primary" style={grow} onClick={onBookTable} />
      </div>
      {hasMenuLink && (
        <div className={styles.actionGrow}>
          <Button label="View menu" variant="secondary" style={grow} onClick={onViewMenu} />
        </div>
      )}
      <div className={styles.shareButton}>
        <Button
          label="Share"
          variant="secondary"
          isIconOnly
          icon={<IconShare />}
          onClick={() => {
            /* First-pass stub — share sheet later */
          }}
        />
      </div>
    </div>
  );
}

export function VenueResultListingContent({
  option,
  date,
  time,
  dietaryNeeds,
  onBookTable,
  userMemory,
}: {
  option: VenueOptionCard;
  date?: string;
  time?: string;
  dietaryNeeds?: DietaryNeeds;
  onBookTable: () => void;
  userMemory?: UserMemory;
}) {
  const enriched = enrichVenueOption(option);
  const social = formatSocialProof(enriched.social_proof);
  const michelinLine = formatMichelinLine(enriched);
  const ratings = enriched.michelin_guide_url != null ? null : formatRatingsLine(enriched);
  const dietaryBadge = formatDietaryBadge(enriched, dietaryNeeds);
  const memory = userMemory ?? getUserMemory();
  const personalizationBadge = formatPersonalizationBadge(enriched.id, memory);
  const menuAction = resolveMenuAction(enriched);
  const aiWriteUps = venueAiWriteUps(enriched);

  const availabilityLine =
    enriched.meta ??
    (date != null && time != null
      ? formatVenueAvailabilityLine(enriched.id, date, time)
      : null);

  const handleViewMenu = () => {
    if (menuAction?.mode === 'exact') {
      openExternalLink(menuAction.url);
    }
  };

  const metaRows: {key: string; icon: ReactNode; text: string}[] = [];
  if (social != null) {
    metaRows.push({
      key: 'social',
      icon: <IconThumb />,
      text: social,
    });
  }
  if (personalizationBadge != null) {
    metaRows.push({
      key: 'personalization',
      icon: <IconUser />,
      text: personalizationBadge,
    });
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {enriched.image_url != null ? (
          <div
            className={styles.image}
            aria-hidden
            style={{backgroundImage: `url(${enriched.image_url})`}}
          />
        ) : (
          <div className={styles.image} aria-hidden />
        )}
        <div className={styles.info}>
          <p className={styles.title}>{enriched.title}</p>
          {availabilityLine != null && <p className={styles.metaLine}>{availabilityLine}</p>}
          {enriched.subtitle != null && <p className={styles.metaLine}>{enriched.subtitle}</p>}
          {michelinLine != null && enriched.michelin_guide_url != null && (
            <p className={styles.metaLine}>
              <a
                className={styles.michelinLink}
                href={enriched.michelin_guide_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={stopCardSelect}>
                {michelinLine}
              </a>
            </p>
          )}
          {ratings != null && <p className={styles.metaLine}>{ratings}</p>}
          {dietaryBadge != null && (
            <span className={styles.chip}>
              <IconCheck className={styles.chipIcon} />
              {dietaryBadge}
            </span>
          )}
        </div>
      </div>

      {aiWriteUps.length > 0 && (
        <div className={styles.metaRows}>
          {aiWriteUps.map((text, index) => (
            <ExpandableAiBlurb key={`${enriched.id}-ai-${index}`} text={text} />
          ))}
        </div>
      )}

      {metaRows.length > 0 && (
        <div className={styles.metaRows}>
          {metaRows.map((row) => (
            <MetaRow key={row.key} icon={row.icon}>
              {row.text}
            </MetaRow>
          ))}
        </div>
      )}

      <VenueListActions
        onBookTable={onBookTable}
        onViewMenu={handleViewMenu}
        hasMenuLink={menuAction != null}
      />
    </div>
  );
}
