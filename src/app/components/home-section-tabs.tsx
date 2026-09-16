'use client';

import type {KeyboardEvent, MouseEvent} from 'react';
import {RotateCcw} from 'lucide-react';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import styles from './home-section-tabs.module.css';

export type HomeMainSection = 'find' | 'friends' | 'profile';

function FindTabRestart({onRestart}: {onRestart: () => void}) {
  return (
    <span
      role="button"
      tabIndex={0}
      className={styles.findRestart}
      aria-label="Start over"
      title="Start over"
      onClick={(event) => {
        event.stopPropagation();
        onRestart();
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onRestart();
      }}>
      <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
    </span>
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
    <div className={styles.tabBarWrap}>
      <TabList
        value={value}
        onChange={(next) => onChange(next as HomeMainSection)}
        layout="fill"
        hasDivider>
        <Tab value="find" label="Find" />
        <Tab value="friends" label="Friends" />
        <Tab value="profile" label="Profile" />
      </TabList>
      {onFindRestart != null && findRestartVisible ? (
        <FindTabRestart onRestart={onFindRestart} />
      ) : null}
    </div>
  );
}
