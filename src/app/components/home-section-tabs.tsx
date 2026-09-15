'use client';

import type {CSSProperties} from 'react';
import {Tab, TabList} from '@astryxdesign/core/TabList';

export type HomeMainSection = 'find' | 'friends' | 'profile';

const tabBarWrap: CSSProperties = {
  width: '100%',
  maxWidth: 800,
  flexShrink: 0,
  paddingBlock: 32,
};

export function HomeSectionTabBar({
  value,
  onChange,
}: {
  value: HomeMainSection;
  onChange: (section: HomeMainSection) => void;
}) {
  return (
    <div style={tabBarWrap}>
      <TabList
        value={value}
        onChange={(next) => onChange(next as HomeMainSection)}
        layout="fill"
        hasDivider>
        <Tab value="find" label="Find" />
        <Tab value="friends" label="Friends" />
        <Tab value="profile" label="Profile" />
      </TabList>
    </div>
  );
}
