'use client';

import type {CSSProperties, MouseEvent} from 'react';
import {RotateCcw} from 'lucide-react';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import styles from './home-section-tabs.module.css';

export type HomeMainSection = 'find' | 'friends' | 'profile';

const tabBarWrap: CSSProperties = {
  width: '100%',
  maxWidth: 800,
  flexShrink: 0,
  paddingBlock: 32,
};

function FindTabRestart({onRestart}: {onRestart: () => void}) {
  const stopTabSelect = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <button
      type="button"
      className={styles.findRestart}
      aria-label="Start over"
      title="Start over"
      onMouseDown={stopTabSelect}
      onClick={(event) => {
        stopTabSelect(event);
        onRestart();
      }}>
      <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

export function HomeSectionTabBar({
  value,
  onChange,
  findRestartVisible = false,
  onFindRestart,
}: {
  value: HomeMainSection;
  onChange: (section: HomeMainSection) => void;
  findRestartVisible?: boolean;
  onFindRestart?: () => void;
}) {
  return (
    <div style={tabBarWrap}>
      <TabList
        value={value}
        onChange={(next) => onChange(next as HomeMainSection)}
        layout="fill"
        hasDivider>
        <Tab
          value="find"
          label="Find"
          endContent={
            onFindRestart != null && findRestartVisible ? (
              <span className={styles.findRestartSlot}>
                <FindTabRestart onRestart={onFindRestart} />
              </span>
            ) : undefined
          }
        />
        <Tab value="friends" label="Friends" />
        <Tab value="profile" label="Profile" />
      </TabList>
    </div>
  );
}
